# Angola Localiza — Notas da versão (Fase 1)

**Data:** 24/09/2026
**Versão de teste no terreno:** build #11 (APK Android, só arm64), do `main` em `39bac46` (PR #33).
**Estado:** Release Candidate para o teste no Huambo.

Este documento resume o que a app e o servidor fazem no fim da Fase 1, o que
ficou decidido para depois e o que depende de decisões do dono do projeto.
O detalhe de cada mudança está nos PRs indicados (#20 a #33).

---

## 1. Estado atual

- Código no `main` depois do PR #33. Não há PRs abertos.
- Testes automáticos: 44 suites e 1754 testes (Jest), mais `npx tsc --noEmit`
  sem erros. O CI ("Verificar projeto") corre em cada PR.
- APK de testes: build #11 (Expo EAS, perfil `preview`, só arm64).
- Supabase (projeto `qntbknegicaghnbnghyw`): as funções e as migrações abaixo
  estão publicadas.

---

## 2. O que a app faz

### 2.1 Mapa e GPS
- A posição junta pelo menos 3 leituras com menos de 10 m e faz uma média
  ponderada. Se ao fim de 20 leituras não o conseguir, marca a precisão como
  "fraca" e avisa.
- O mapa mostra:
  - o **Plus Code** (11 caracteres) e a precisão do GPS;
  - o **Código Postal Digital** (provisório sem rede, confirmado com rede);
  - a província e o município.
- O mapa do Huambo é descarregado uma vez e depois funciona sem rede
  (© OpenStreetMap).

### 2.2 Moradas
- **Guardadas:** lista e favoritos, também sem rede.
- **Registar morada:**
  - **Regra dos 5 metros:** junto ao limite de uma célula do código postal
    (a menos de 5 m, ou a menos do que a precisão), a app não escolhe a
    célula "à sorte". Pede para medir de novo no centro da entrada ou para
    escolher a célula. A posição enviada fica 1 m dentro da célula escolhida.
  - **Ruas e bairros sugeridos:** são pedidos com essa mesma posição, por
    isso pertencem à célula escolhida.
  - **Bairro obrigatório:** lista de bairros conhecidos perto, ou escrito à
    mão (`neighborhood_name`).
  - **Tipo de local:** com "Outro", a descrição é obrigatória (ex.: Padaria)
    e é ela que vai para o servidor.
  - **Foto da fachada:** marca de água igual à dos técnicos de campo:
    `📍 <Plus Code> · <latitude>, <longitude>` (5 casas decimais) e a data e
    hora. O 📍 usa a letra de emojis do Android; sem ela, fica só o texto.
  - **Duplicados:** aviso de morada a menos de 15 m, com confirmação.
  - **Lista "Falta:":** diz o que ainda falta; o botão Enviar só fica ativo
    com tudo preenchido.
  - **Sem rede:** o registo fica guardado no telemóvel e sobe sozinho quando
    a rede voltar (fila `field_submit`, com a foto ligada ao envio).

### 2.3 Verificação simples do cidadão (KYC)
- **Fotos:**
  - BI (frente e verso);
  - duas selfies, a segunda com um **gesto sorteado**. O gesto aparece com
    um emoji grande (✋ 😁 😉 👍 👀⬅️ 👀➡️), escondido dos leitores de ecrã;
  - todas levam marca de água com a data e hora, e a do gesto leva também o
    nome do gesto.
- **Envio próprio, que funciona sem rede:**
  - o pedido fica guardado no telemóvel;
  - se a rede cair a meio, continua onde parou;
  - depois do envio, as fotos são apagadas do telemóvel.
- **Estados:** por verificar, pendente (no telemóvel), em revisão, aprovada,
  recusada (com o motivo).
- **Só com a verificação aprovada** se podem registar moradas.

### 2.4 Painel Admin (separador Admin)
- **Lista das verificações por rever,** com o nome, o email, o telefone e a
  data de envio.
- **Fotos:**
  - só se pedem ao abrir um pedido;
  - chegam por links de 10 minutos e ficam só na memória, sem cache nem
    ficheiros;
  - cada abertura fica registada.
- **Decisão:**
  - aprovar, com confirmação;
  - recusar, com motivo obrigatório (5 motivos rápidos);
  - o cidadão recebe uma notificação.
- **Quem pode decidir:** só super_admin e os administradores nacional,
  provincial e municipal. O auditor vê o separador, mas não decide.

### 2.5 Contas
- **Nome completo obrigatório no registo** (nome e apelido, com acentos).
  Fica em `user_metadata.full_name`.
- **Contas antigas sem nome:** o ecrã "Como te chamas?" aparece antes do
  resto da app (depois do código MFA, se for pessoal com cargo).

---

## 3. Servidor (Supabase)

| Peça | Versão | O que faz |
| --- | --- | --- |
| `field-service` | v22 | Código postal da aprovação no esquema 2 (corrigiu o "undefined"); grava o `plus_code` (10 dígitos) na aprovação e na fusão; recebe o `neighborhood_name` de todos |
| `citizen-verify` | v4 | Confirma no Storage que as 3 fotos existem e são de quem pede; deixa o pedido "Por rever" (sem aprovar sozinha); `list_pending` com contacto; `view` com registo de consulta; `review` atómico, sem rever a própria verificação |
| Migração `verificacao_cidadao_por_rever` | — | Estado da verificação, revisor, data, motivo; função `kyc_artefactos_do_utilizador` (só `service_role`) |
| Migração `auditoria_vistas_kyc_cidadao` | — | `identity_artifact_views` aceita vistas de fotos de cidadãos (`citizen_user_id`) sem afetar as do staff |

**Segurança e conformidade**
- As fotos do BI e as selfies ficam no bucket **privado** `kyc-artifacts`.
- Cada consulta das fotos por um administrador fica registada (Lei n.º
  22/11, Proteção de Dados Pessoais). Sem registo, as fotos não são
  entregues.
- Nenhum administrador pode aprovar a própria verificação.
- Duas decisões ao mesmo tempo sobre o mesmo pedido: só a primeira conta;
  a segunda recebe "já decidido".

---

## 4. Processo de trabalho

- As regras do projeto estão em `CLAUDE.md`:
  - builds da Expo e merges só com a autorização do dono;
  - testes para tudo o que muda;
  - descrição de cada PR com "Como foi testado" e "O que só se pode testar
    num telemóvel real";
  - nunca usar `SUPABASE_SERVICE_ROLE_KEY` nos workflows.
- APK mais pequeno: só arm64.
- O CI corre sem avisos na consola.

---

## 5. Por fazer

### 5.1 A seguir
- **Teste no terreno (Huambo) com o build #11:**
  - verificação sem rede e continuação quando a rede cai a meio;
  - marca de água;
  - regra dos 5 metros;
  - bairro e tipo "Outro";
  - painel Admin.
- **Depois do teste,** confirmar no Supabase:
  - o `neighborhood_name` e o tipo na referência (`[Padaria] …`);
  - o `plus_code` das moradas aprovadas;
  - as linhas em `identity_artifact_views`.

### 5.2 Decidido, por fazer (ver `BACKLOG.md`)
- **Retenção:** as fotos do BI e as selfies são apagadas 90 dias depois da
  decisão.
- **Infraestrutura** (depois de confirmar o que o site antigo usa):
  - tirar o acesso sem sessão às funções SECURITY DEFINER (`is_admin`,
    `is_id_verified`, `can_validate_field`, `nearby_addresses`…);
  - limites no bucket `kyc-artifacts` (só JPEG, até 5 MB, uma pasta por
    utilizador).
- **Depois de validar o APK:**
  - publicar as Edge Functions por um workflow manual (sem a service role
    key);
  - guardar a estrutura completa da base de dados no repositório;
  - testar as funções do servidor a correr de verdade;
  - relatório de erros da app, leve, para gastar poucos dados.

### 5.3 Site antigo (hotfix)
- Deixar de mostrar "Verificado!" logo depois do envio da verificação: deve
  mostrar "Em revisão".
- Pedir o nome completo no registo (`options.data.full_name`).

### 5.4 Decisões do dono do projeto
- **Alcance dos administradores:** hoje um `admin_municipal` revê cidadãos
  de todo o país. Para limitar por zona, é preciso saber onde o cidadão vive.
- **Proteção contra palavras-passe roubadas:** confirmar que está ligada no
  painel do Supabase.
- **Separadores ainda "Em construção"** (Validar, Campo…): o que vem depois
  do teste no terreno.

---

## 6. PRs da Fase 1 (no `main`)

- **#20–#22:** mapa (província e município pela função geocode), GPS com leituras de menos de 10 m, aviso do limite das células e Moradas (parte 1).
- **#23:** processo de trabalho (APK só arm64, modelo de PR, `CLAUDE.md`).
- **#24:** Moradas, parte 2 (registar morada, regra dos 5 metros).
- **#25:** field-service no esquema 2 do código postal.
- **#26:** verificação simples do cidadão (KYC) na app.
- **#27:** citizen-verify v3 ("Por rever") e `plus_code` na aprovação.
- **#28:** painel Admin de revisão.
- **#29:** citizen-verify v4 (contacto, sem aprovar a própria verificação,
  decisão atómica, registo de consultas, lista mais rápida).
- **#30:** nome completo obrigatório.
- **#31:** marca de água dos técnicos, bairro obrigatório, ruas e bairros da
  célula escolhida.
- **#32:** testes sem avisos na consola.
- **#33:** tipo "Outro" com descrição, emoji do gesto da selfie.
