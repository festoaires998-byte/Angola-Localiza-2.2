# src/domain/entregas

Domínio 3: estados da entrega, preço por zonas A/B/C, rotas.

- `envio.ts`: separador Enviar — o que falta no pedido, o telefone
  (`+244 9xx xxx xxx`), o pedido para `deliveries?action=create`, os estados em
  palavras simples, quando se pode cancelar e a leitura das respostas (a
  entrega e o PIN). O servidor (deliveries v19) volta a validar tudo.
