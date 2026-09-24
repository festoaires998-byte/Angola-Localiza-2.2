# src/domain/entregas

Domínio 3: estados da entrega, preço por zonas A/B/C, rotas.

- `envio.ts`: separador Enviar — o que falta no pedido, o telefone
  (`+244 9xx xxx xxx`), o pedido para `deliveries?action=create`, os estados em
  palavras simples, quando se pode cancelar e a leitura das respostas (a
  entrega e o PIN). O servidor (deliveries v19) volta a validar tudo.
- `estafeta.ts`: separador Entregas — o passo seguinte de cada estado, o que
  falta na prova de entrega (PIN, foto, assinatura desenhada, GPS), os payloads
  da fila (`delivery_proof`), o estado a mostrar com ações à espera de rede e os
  erros do servidor em palavras simples.
- `assinaturaDedo.ts`: traços da assinatura com o dedo → caminho SVG; uma
  assinatura tem de ter pelo menos 60 pontos de comprimento.
