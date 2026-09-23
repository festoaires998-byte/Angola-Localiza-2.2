# src/services/mapas

Mapa base para usar **sem rede** (MapLibre + PMTiles).

| Ficheiro | Para que serve |
| --- | --- |
| `regioes.ts` | Regiões com mapa (por agora só **Huambo e arredores**), fontes e ícones. |
| `estiloMapa.ts` | `criarEstilo()`: estilo Protomaps "light" com nomes em português e `© OpenStreetMap`. |
| `nucleoMapaOffline.ts` | Descarga, verificação (tamanho e md5) e atualização do ficheiro, com as dependências por parâmetro (testável). |
| `mapaOffline.ts` | `mapaHuambo`: o núcleo ligado ao `expo-file-system` e ao Supabase Storage. |

## De onde vem o mapa

1. O workflow `.github/workflows/mapa-offline.yml` recorta o Huambo do build diário
   do Protomaps (dados do OpenStreetMap) com `pmtiles extract`, mede o tamanho
   (falha acima de 45 MB) e publica no Supabase Storage, bucket público `mapas`:

   ```
   mapas/huambo/manifesto.json          ← versão, nome do ficheiro, bytes, md5
   mapas/huambo/huambo-AAAAMMDD.pmtiles
   mapas/recursos/fontes/NotoSans*/…pbf ← letras dos nomes (Noto Sans)
   mapas/recursos/sprite/light*.json|png ← ícones
   ```

   Corre sozinho no dia 1 de cada mês, e em "Run workflow". Guarda as 2 últimas versões.
2. A app lê o manifesto (com rede), mostra o tamanho e descarrega tudo para
   `Documentos/mapas/`. O ficheiro só substitui o anterior depois de chegar completo.
3. Sem mapa guardado mas com rede, o mapa é lido diretamente do Storage
   (`pmtiles://https://…`), só as partes que aparecem no ecrã.

O bbox do Huambo está em `regioes.ts` **e** no workflow; o workflow falha se forem diferentes.

## Regras do OpenStreetMap

Os dados são do OpenStreetMap (licença ODbL): o ecrã mostra sempre `© OpenStreetMap`.
Não usamos os servidores do OpenStreetMap: o ficheiro é nosso, no nosso Storage.
