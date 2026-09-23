import type { Migracao } from './tipos';

/**
 * Primeira versão da base de dados local.
 *
 * Convenções:
 * - datas em texto ISO UTC ("2026-09-23T10:15:00.000Z");
 * - booleanos como 0/1;
 * - JSON guardado em TEXT (validado com json_valid);
 * - campos de estado e categoria com CHECK, para não entrar lixo.
 */
export const migracao001: Migracao = {
  versao: 1,
  nome: 'inicial',
  async aplicar(tx) {
    await tx.exec(`
      -- a) Operações à espera de ir para a Edge Function "sync".
      CREATE TABLE fila_saida (
        operation_id         TEXT PRIMARY KEY NOT NULL,
        device_id            TEXT NOT NULL,
        operation_type       TEXT NOT NULL CHECK (operation_type IN
                               ('create_address', 'create_delivery', 'field_submit', 'delivery_proof')),
        payload_json         TEXT NOT NULL CHECK (json_valid(payload_json)),
        estado               TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN
                               ('pendente', 'a_enviar', 'concluida', 'falhou_definitivo')),
        tentativas           INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
        ultimo_erro          TEXT,
        proxima_tentativa_em TEXT,
        criado_em            TEXT NOT NULL,
        atualizado_em        TEXT NOT NULL
      );
      CREATE INDEX idx_fila_saida_prontas ON fila_saida (estado, proxima_tentativa_em, criado_em);

      -- b) Fotos/assinaturas guardadas no telemóvel à espera de upload.
      --    O ficheiro em si fica em FileSystem.documentDirectory; aqui só o registo.
      --    No payload aparecem como "offline:<id>".
      CREATE TABLE ficheiros_pendentes (
        id            TEXT PRIMARY KEY NOT NULL,
        caminho_local TEXT NOT NULL,
        bucket        TEXT NOT NULL,
        content_type  TEXT NOT NULL,
        sha256        TEXT,
        tamanho_bytes INTEGER CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0),
        operation_id  TEXT REFERENCES fila_saida (operation_id) ON DELETE SET NULL,
        url_remota    TEXT,
        estado        TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'enviado')),
        criado_em     TEXT NOT NULL,
        CHECK (estado = 'pendente' OR url_remota IS NOT NULL)
      );
      CREATE INDEX idx_ficheiros_pendentes_operacao ON ficheiros_pendentes (operation_id);
      CREATE INDEX idx_ficheiros_pendentes_estado ON ficheiros_pendentes (estado);

      -- c) Moradas conhecidas (do servidor, da zona offline ou criadas aqui).
      CREATE TABLE moradas (
        id            TEXT PRIMARY KEY NOT NULL,
        plus_code     TEXT,
        codigo_postal TEXT,
        latitude      REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        precisao_m    REAL CHECK (precisao_m IS NULL OR precisao_m >= 0),
        provincia     TEXT,
        municipio     TEXT,
        estado        TEXT,
        origem        TEXT NOT NULL CHECK (origem IN ('servidor', 'zona_offline', 'local')),
        dados_json    TEXT CHECK (dados_json IS NULL OR json_valid(dados_json)),
        atualizado_em TEXT NOT NULL
      );
      CREATE INDEX idx_moradas_plus_code ON moradas (plus_code);
      CREATE INDEX idx_moradas_codigo_postal ON moradas (codigo_postal);
      CREATE INDEX idx_moradas_coordenadas ON moradas (latitude, longitude);

      -- d) Zonas descarregadas para usar sem rede.
      CREATE TABLE zona_offline (
        id            TEXT PRIMARY KEY NOT NULL,
        latitude      REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude     REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        raio_metros   REAL NOT NULL CHECK (raio_metros > 0),
        total_moradas INTEGER NOT NULL DEFAULT 0 CHECK (total_moradas >= 0),
        resposta_json TEXT CHECK (resposta_json IS NULL OR json_valid(resposta_json)),
        preparado_em  TEXT NOT NULL
      );

      -- e) Moradas favoritas do utilizador.
      CREATE TABLE favoritos (
        id            TEXT PRIMARY KEY NOT NULL,
        morada_id     TEXT NOT NULL,
        nome          TEXT NOT NULL,
        categoria     TEXT NOT NULL DEFAULT 'outro' CHECK (categoria IN
                        ('casa', 'trabalho', 'familia', 'cliente', 'loja', 'entrega', 'outro')),
        atualizado_em TEXT NOT NULL
      );
      CREATE INDEX idx_favoritos_morada ON favoritos (morada_id);
      CREATE INDEX idx_favoritos_categoria ON favoritos (categoria);

      -- f) Levantamentos de campo (moradas recolhidas pelos agentes).
      CREATE TABLE levantamentos (
        id                      TEXT PRIMARY KEY NOT NULL,
        estado                  TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN
                                  ('rascunho', 'na_fila', 'enviado', 'aprovado', 'rejeitado')),
        latitude                REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
        longitude               REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
        plus_code               TEXT,
        precisao_m              REAL CHECK (precisao_m IS NULL OR precisao_m >= 0),
        justificacao_precisao   TEXT,
        bairro_id               TEXT,
        rua_id                  TEXT,
        referencia              TEXT,
        porta_intercalada_entre TEXT,
        operation_id            TEXT REFERENCES fila_saida (operation_id) ON DELETE SET NULL,
        dados_json              TEXT CHECK (dados_json IS NULL OR json_valid(dados_json)),
        criado_em               TEXT NOT NULL,
        atualizado_em           TEXT NOT NULL
      );
      CREATE INDEX idx_levantamentos_estado ON levantamentos (estado, atualizado_em);
      CREATE INDEX idx_levantamentos_operacao ON levantamentos (operation_id);

      -- g) Entregas (o estado vem do servidor, por isso não tem CHECK).
      CREATE TABLE entregas (
        id            TEXT PRIMARY KEY NOT NULL,
        estado        TEXT NOT NULL,
        dados_json    TEXT CHECK (dados_json IS NULL OR json_valid(dados_json)),
        atualizado_em TEXT NOT NULL
      );
      CREATE INDEX idx_entregas_estado ON entregas (estado, atualizado_em);

      -- h) Listas de referência (províncias, municípios, ..., quadras).
      CREATE TABLE referencias (
        tipo          TEXT NOT NULL CHECK (tipo IN
                        ('provincia', 'municipio', 'comuna', 'bairro', 'rua', 'quadra')),
        id            TEXT NOT NULL,
        pai_id        TEXT,
        nome          TEXT NOT NULL,
        dados_json    TEXT CHECK (dados_json IS NULL OR json_valid(dados_json)),
        atualizado_em TEXT NOT NULL,
        PRIMARY KEY (tipo, id)
      );
      CREATE INDEX idx_referencias_pai ON referencias (tipo, pai_id);

      -- i) Chave do dispositivo.
      --    ATENÇÃO: aqui só vai a chave PÚBLICA. A chave PRIVADA NUNCA pode
      --    ser guardada nesta base de dados: vai para o expo-secure-store
      --    (feito noutro PR).
      CREATE TABLE chaves_dispositivo (
        device_id         TEXT PRIMARY KEY NOT NULL,
        chave_publica_jwk TEXT NOT NULL CHECK (json_valid(chave_publica_jwk)),
        registada         INTEGER NOT NULL DEFAULT 0 CHECK (registada IN (0, 1)),
        criada_em         TEXT NOT NULL
      );
    `);
  },
};
