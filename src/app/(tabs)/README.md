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

Mapa (MapLibre) com a posição, o **Plus Code** de 11 caracteres, a **precisão
do GPS**, o **Código Postal Digital** (provisório sem rede, confirmado com
rede) e a **província e o município**. O mapa do Huambo é descarregado uma vez
e depois funciona sem rede; mostra sempre `© OpenStreetMap`. Ver
`src/services/mapas` e `src/services/location`.

A pesquisa, a partilha e o QR ficam para o PR seguinte.

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
