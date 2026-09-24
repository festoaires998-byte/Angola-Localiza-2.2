# src/app/(tabs)

Ecrãs principais: mapa, guardados, entrega, minhas-entregas, campo, validar, admin, definicoes.

Quem vê cada separador é decidido em `src/domain/organizacao/cargos.ts`
(`separadoresPermitidos` / `decidirAcesso`). Os ecrãs usam o hook `useCargos()`
e só mostram os separadores de `separadores`.

| Separador | Quem vê |
| --- | --- |
| mapa, definicoes | Todos, sempre |
| guardados | Cidadão, tecnico_campo, supervisor |
| entrega | Cidadão |
| minhas-entregas | Cidadão, estafeta, operador_postal |
| campo | tecnico_campo |
| validar | supervisor, admin_municipal, admin_provincial, admin_nacional |
| admin | admin_municipal, admin_provincial, admin_nacional, auditor |

## Mapa (`mapa.tsx`)

Igual ao Mapa do site (`index.html` do repositório antigo), por esta ordem:

1. **Pesquisa única** ("Pesquisar código, Plus Code, rua, bairro..."). Plus
   Codes, coordenadas e links de mapas resolvem-se no telemóvel (sem rede); o
   resto vai à Edge Function `pesquisa` (só moradas aprovadas; as privadas só
   para quem as criou).
2. **Obter localização** e **Ler QR** (câmara; um link de mapas vai para o
   ponto, outro link só abre se a pessoa quiser).
3. Cartão com o **Código Postal Digital** (provisório sem rede, confirmado com
   rede), o **Plus Code** de 11 caracteres, a **divisão administrativa**, a
   **precisão do GPS** e as **coordenadas**.
4. **QR Code** (abre no Google Maps) com **Guardar** (imagem, pela janela de
   partilha) e **Partilhar** (texto com os códigos e o link).
5. **Registar esta casa, loja, escola...** (só com a verificação simples).
6. **Mapa** (MapLibre) com o alternador **Mapa/Satélite** e **Ecrã inteiro**.
   O mapa do Huambo é descarregado uma vez e funciona sem rede (`© OpenStreetMap`);
   o satélite só com rede e depois de a pessoa aceitar o aviso de dados móveis.
7. **Privacidade**, **Categoria** e **Guardar como favorito** (só com a
   verificação simples). Funciona sem rede: a morada (por validar) e o favorito
   ficam no telemóvel e vão para o servidor quando houver rede.
8. **Mapa para usar sem rede** (descarregar/atualizar).

Ver `src/components/mapa`, `src/services/mapas` e `src/services/location`.

## Acesso

Os separadores que o utilizador não pode ver ficam dentro de `Tabs.Protected`: não
aparecem na barra e não abrem nem por link. Os que ainda não existem mostram
"Em construção" (`src/components/EmConstrucao.tsx`).

Staff com KYC por verificar vê, por cima de tudo, o aviso fixo: "A tua identidade
ainda não foi verificada. Até lá só tens acesso ao Mapa e à Conta."

`definicoes/` tem o ecrã das Definições (conta, sincronização, avisos, Sair, versão)
e `definicoes/diagnostico.tsx` (o antigo ecrã provisório de diagnóstico).

Nomes na barra (curtos, para caberem os 8): Mapa, Moradas (`guardados`),
Enviar (`entrega`), Entregas (`minhas-entregas`), Campo, Validar, Gestão (`admin`)
e Conta (`definicoes`). Os nomes das rotas não mudaram.

O super_admin vê todos. Staff (quem tem cargos) só vê mais do que mapa e
definicoes depois de ter o KYC em `ID_VERIFIED` **e** a sessão em AAL2 (código MFA).

## Moradas (`guardados/`): os meus registos

Por cima das moradas guardadas, a secção **"Os meus registos"** mostra as
moradas que a pessoa registou e em que ponto estão: à espera de rede (ainda na
fila), à espera de validação, aprovada (com o código postal e o número),
recusada ou duplicada. Os registos vêm de `field_records` (só os da própria
pessoa) e ficam guardados no telemóvel.

Quando um registo é aprovado, a app **junta a morada aos favoritos sozinha**,
uma só vez (categoria pelo tipo de local: Casa → casa, Loja → loja…). Se a
pessoa depois a tirar, não volta a entrar. Ver `src/services/moradas/registos.ts`.

## Enviar (`entrega/`)

Stack com três ecrãs, que partilham o estado em `src/state/envios.ts`:
- `entrega/index.tsx`: "Os meus envios" (estado, código de rastreio, "Urgente") e
  os pedidos feitos sem rede, ainda à espera de rede;
- `entrega/novo.tsx`: morada de destino (uma das guardadas que já existem no
  servidor), nome e telefone de quem recebe, instruções e prioridade. A lista
  "Falta:" bloqueia o botão. Só com a identidade verificada (senão leva a
  Conta → Verificação);
- `entrega/[id].tsx`: detalhe, PIN (só a pedido: "Mostrar o PIN"; nunca fica
  guardado no telemóvel), "Gerar um PIN novo" e "Cancelar o envio" (os dois
  com confirmação num alerta do sistema).

Com rede o pedido vai logo à `deliveries` (a resposta traz o PIN); sem rede
vai para a fila (`create_delivery`) e sai sozinho quando a rede voltar. Ver
`src/services/entregas/envios.ts`.

## Entregas do estafeta (`minhas-entregas/`)

Stack, com o estado partilhado em `src/state/estafeta.ts` (lido por
`useEntregasEstafeta`, que volta a ler quando a fila muda):
- `index.tsx`: as entregas atribuídas ao estafeta (as por fazer primeiro), com o
  estado, "Urgente", "À espera de rede" e "Recusada pelo servidor". Quem não é
  estafeta vê uma explicação;
- `[id].tsx`: destino, "Ligar a…", "Abrir o destino no mapa", o passo seguinte
  (a recolha exige uma foto com marca de água), as ações à espera de rede e as
  recusadas (ex.: PIN errado, em palavras simples);
- `prova.tsx`: prova de entrega (decisão C): foto com marca de água, assinatura
  de quem recebe com o dedo (`src/components/AssinaturaDedo.tsx`, gravada em PNG)
  e o PIN. A lista "Falta:" bloqueia o botão. A prova é assinada pela chave do
  aparelho (SHA-256 da foto e da assinatura, local e hora) e vai pela fila;
- `falha.tsx`: "Não foi possível entregar", com o motivo e foto opcional.

Tudo funciona sem rede (decisão D): as ações vão pela fila (`delivery_proof`),
pela ordem em que foram feitas, e o PIN só é conferido quando a prova chega ao
servidor. Um PIN errado não é reenviado sozinho (gastava as 5 tentativas): fica
recusado e o estafeta faz a prova de novo. Ver `src/services/entregas/estafeta.ts`.

## Admin (`admin/`)

`admin/index.tsx` (lista) e `admin/[id].tsx` (detalhe, num ecrã próprio do Stack: o botão Voltar regressa à lista tal como estava). Aprovar pede confirmação num alerta do sistema (`Alert.alert`). A lista e o detalhe partilham o estado em `src/state/revisaoKyc.ts`.


Revisão das verificações simples dos cidadãos (citizen-verify `list_pending` e
`review`):
- lista os pedidos "por rever";
- mostra as 3 fotos do bucket privado `kyc-artifacts` (links de 10 minutos,
  descarregadas só para a memória do ecrã, sem cache nem ficheiros);
- aprova com confirmação, ou recusa com motivo obrigatório (o cidadão vê o motivo).

Só para super_admin, admin_nacional, admin_provincial e admin_municipal (os
mesmos que a função SQL `is_admin` aceita). O auditor vê o separador, mas não
decide. Precisa de rede.
