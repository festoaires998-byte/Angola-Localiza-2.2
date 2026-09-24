# src/domain/enderecamento

Domínio 1: Plus Code local e Código Postal Digital.

## Plus Code (`plusCode.ts`)

Um **Plus Code** é um "endereço" curto feito a partir das coordenadas GPS.
Por exemplo, o ponto `-8.8383, 13.2344` (Luanda) dá o código `6F3M566M+MQJ`.
Não precisa de internet nem de nomes de ruas: qualquer pessoa pode gerá-lo
e lê-lo.

O módulo segue a especificação oficial Open Location Code (Google) e faz as
contas com números inteiros, para não haver erros de arredondamento. Não usa
React, Expo nem hardware, e não depende de bibliotecas externas.

### O que exporta

| Função | O que faz |
| --- | --- |
| `encode(lat, lng, comprimento = 11)` | Transforma a coordenada num código. |
| `decode(codigo)` | Devolve a área (retângulo) do código e o seu centro. |
| `isValid(codigo)` | Diz se o texto é um Plus Code válido (completo ou curto). |
| `isFull(codigo)` / `isShort(codigo)` | Diz se o código é completo ou curto. |

### Tamanho do código

| Comprimento | Exemplo | Tamanho da área (aprox.) |
| --- | --- | --- |
| 10 | `6F3M566M+MQ` | 14 m × 14 m — é o formato do site |
| 11 (padrão) | `6F3M566M+MQJ` | 3 m × 3 m — acrescenta 1 dígito de grelha |

### Compatibilidade com o site

Os códigos guardados no Supabase têm 10 dígitos e foram gerados pela função
antiga `encodeOLC` do site. Os primeiros 10 dígitos (mais o `+`) de
`encode(lat, lng, 11)` são iguais ao código antigo, e `encode(lat, lng, 10)`
dá exatamente o mesmo texto. Os testes confirmam isto com 1000 coordenadas
aleatórias em Angola.

**Exceção conhecida:** a função antiga faz contas com números decimais. Quando
uma coordenada cai *exatamente* na linha que separa duas células (acontece com
coordenadas "redondas", com 6 casas decimais ou menos, ex.: `-11.765`), a
função antiga pode escolher a célula vizinha a sul ou a oeste. O módulo novo
segue a regra oficial. Nesses casos o código antigo continua a apontar para o
mesmo sítio (o ponto está na borda da sua área), mas o texto é diferente.

### Testes

```bash
npm test
```

## Código Postal Digital (`codigoPostal.ts`)

Formato `AO-{PROV}-{GRID8}[-{N}]-{CHK}`, esquema 2, igual à Edge Function
`generate-postal-code` (`supabase/functions/generate-postal-code/codigoPostal.ts`).
`codigoPostalProvisorio(lat, lng, provincia)` faz no telemóvel as mesmas contas
(sem o `-N`, que só o servidor sabe). O teste `codigoPostal.test.ts` compara-o
com as contas do servidor em 5000 pontos e confirma que os códigos antigos
(esquema 1) que eram válidos não mudam.

### Sigla da província

As 3 primeiras letras do nome que o geocode devolve, em maiúsculas (como no
esquema 1); `XXX` se não veio nome. Há siglas repetidas entre províncias
(Cuanza Norte e Cuanza Sul dão `CUA`; Lunda Norte e Lunda Sul dão `LUN`) e um nome
com acento nas primeiras letras (ex.: "Uíge" → `UÍG`) dá um código que o
`validate` não aceita; o ecrã mostra então "Indisponível neste ponto".

## Captura do GPS (`capturaGps.ts`)

Uma leitura do GPS sozinha pode saltar 10–20 m e mudar o código postal de célula
(cada célula tem ~38 m × 19 m). Por isso o código não usa uma leitura só:

1. junta pelo menos **3 leituras**, uma por segundo, com a precisão mais alta do telemóvel;
2. só contam as leituras com menos de **±10 m**;
3. faz a **média com peso** 1/precisão² (uma leitura de ±4 m pesa 4 vezes mais
   que uma de ±8 m). A precisão mostrada é a melhor das leituras usadas.

Com a pessoa parada, cada leitura nova abaixo de 10 m entra na média (até às
10 mais precisas), e a posição vai melhorando. Se uma leitura boa mostrar que a
pessoa se afastou mais de 20 m, mede-se de novo (também há o botão "Medir de novo").

Se ao fim de 20 leituras (~20 s) não houver 3 abaixo de 10 m (é comum dentro de
casa), usa as 3 melhores e marca a captura como **fraca**: o Mapa mostra o
código com a etiqueta "Pouco preciso (± N m)" e um aviso, e continua a medir.
Com uma captura fraca, o código fica **Provisório**: não se pede a confirmação
ao servidor nem se mostra um código confirmado guardado (podia ser o da célula
vizinha). A província e o município continuam a aparecer (as zonas têm ~275 m).
No Mapa, o ponto azul continua ao vivo; o Plus Code e o código postal usam a
posição medida. Guardar uma morada vai usar a mesma captura e **não aceita uma
captura fraca**.

### Limite das células (`limitesCelula`, `distanciaAoLimiteCelula`)

Cada célula do código postal tem ~38 m × 19 m. Um ponto a poucos metros do
lado da célula pode, com o erro normal do GPS (±3–5 m), cair umas vezes nesta
célula e outras na vizinha, e o código "troca" sem a pessoa se mexer. Não há
precisão que evite isto num ponto de fronteira. Por isso, quando a posição
medida está a menos de 5 m (ou a menos que a precisão do GPS) do limite, o
Mapa avisa: "Estás junto ao limite entre duas células do código postal".
Uma morada registada guarda o seu código e não muda; o registo de moradas vai
mostrar o mesmo aviso antes de guardar.

## Registar uma morada (`registoMorada.ts`)

O código postal de uma morada nova é calculado pelo **servidor** quando a
morada é aprovada (Edge Function `field-service`, a partir das coordenadas
enviadas). Por isso as regras são cumpridas no telemóvel, antes de enviar:

- **Precisão melhor que ±10 m** (captura não "fraca"); senão não deixa enviar
  nem tirar a foto.
- **Junto ao limite de uma célula** (menos de 5 m, ou menos que a precisão):
  a app nunca deixa o código "à sorte". Pede para medir no centro da entrada
  (botão "Medir de novo") **ou** mostra as duas células (os dois códigos) e a
  pessoa escolhe. Com a escolha, a posição enviada fica **1 m dentro** da célula
  escolhida (`pontoNaCelula`; anda no máximo a distância ao limite + 1 m) e o
  servidor dá o código dessa célula.
- `faltaParaEnviar` lista o que falta (tipo de local, rua, referência, foto,
  confirmar morada duplicada perto); `montarPedidoRegisto` monta o pedido do
  `field-service?action=submit`, que vai pela fila (`field_submit`).

