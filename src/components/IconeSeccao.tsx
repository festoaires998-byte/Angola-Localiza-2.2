import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type NomeSeccao =
  | 'conta'
  | 'pais'
  | 'motorista'
  | 'identidade'
  | 'verificacao'
  | 'notificacoes'
  | 'sincronizacao'
  | 'atencao'
  | 'ajuda'
  | 'origem'
  | 'destino'
  | 'carga'
  | 'nota'
  | 'prioridade'
  | 'camara'
  | 'video'
  | 'assinatura'
  | 'pin'
  | 'historico'
  | 'estrela'
  | 'mapa'
  | 'apagar'
  | 'aparencia';

/** Ícones simples (traço) das secções, para as pastilhas de cor dos cartões. */
export function IconeSeccao({ nome, cor, tamanho = 22 }: { nome: NomeSeccao; cor: ColorValue; tamanho?: number }) {
  const traco = { stroke: cor, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" accessibilityElementsHidden>
      {nome === 'conta' ? (
        <>
          <Circle cx={12} cy={8} r={4} {...traco} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...traco} />
        </>
      ) : nome === 'pais' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...traco} />
          <Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" {...traco} />
        </>
      ) : nome === 'motorista' ? (
        <>
          <Rect x={2} y={6} width={12} height={10} rx={1} {...traco} />
          <Path d="M14 9h4l3 3.5V16h-7z" {...traco} />
          <Circle cx={6.5} cy={18} r={2} {...traco} />
          <Circle cx={17} cy={18} r={2} {...traco} />
        </>
      ) : nome === 'identidade' ? (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...traco} />
          <Circle cx={9} cy={11} r={2.2} {...traco} />
          <Path d="M5.8 16c.7-1.6 1.8-2.4 3.2-2.4s2.5.8 3.2 2.4M15 10h3M15 14h3" {...traco} />
        </>
      ) : nome === 'verificacao' ? (
        <>
          <Path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" {...traco} />
          <Path d="M8.5 12l2.5 2.5 4.5-5" {...traco} />
        </>
      ) : nome === 'notificacoes' ? (
        <>
          <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" {...traco} />
          <Path d="M10 20.5a2 2 0 0 0 4 0" {...traco} />
        </>
      ) : nome === 'sincronizacao' ? (
        <>
          <Path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" {...traco} />
          <Path d="M4 4v4h4" {...traco} />
          <Path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" {...traco} />
          <Path d="M20 20v-4h-4" {...traco} />
        </>
      ) : nome === 'atencao' ? (
        <>
          <Path d="M12 3l9.5 17h-19z" {...traco} />
          <Path d="M12 10v4.5M12 17.5v.01" {...traco} />
        </>
      ) : nome === 'origem' || nome === 'destino' ? (
        <>
          <Path d="M12 22s7-7.6 7-13a7 7 0 0 0-14 0c0 5.4 7 13 7 13z" {...traco} />
          {nome === 'origem' ? <Circle cx={12} cy={9} r={2.6} {...traco} /> : <Path d="M9.5 9l2 2 3.5-4" {...traco} />}
        </>
      ) : nome === 'carga' ? (
        <>
          <Path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" {...traco} />
          <Path d="M3 7.5l9 4.5 9-4.5M12 12v9" {...traco} />
        </>
      ) : nome === 'nota' ? (
        <>
          <Path d="M5 3h10l4 4v14H5z" {...traco} />
          <Path d="M9 11h6M9 15h6M9 19h3" {...traco} />
        </>
      ) : nome === 'prioridade' ? (
        <Path d="M13 2L4 14h7l-1 8 9-12h-7z" {...traco} />
      ) : nome === 'camara' ? (
        <>
          <Path d="M3 8h4l2-3h6l2 3h4v12H3z" {...traco} />
          <Circle cx={12} cy={13.5} r={3.5} {...traco} />
        </>
      ) : nome === 'video' ? (
        <>
          <Rect x={2.5} y={6} width={13} height={12} rx={2} {...traco} />
          <Path d="M15.5 10.5L21 7.5v9l-5.5-3" {...traco} />
        </>
      ) : nome === 'assinatura' ? (
        <>
          <Path d="M3 17c3-4 5-9 7-8s-2 9 1 9 3-4 5-4 2 3 5 3" {...traco} />
          <Path d="M3 21h18" {...traco} />
        </>
      ) : nome === 'pin' ? (
        <>
          <Rect x={4} y={10} width={16} height={11} rx={2} {...traco} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5" {...traco} />
        </>
      ) : nome === 'historico' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...traco} />
          <Path d="M12 7v5l3.5 2" {...traco} />
        </>
      ) : nome === 'estrela' ? (
        <Path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z" {...traco} />
      ) : nome === 'mapa' ? (
        <>
          <Path d="M3 6l6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z" {...traco} />
          <Path d="M9 3.5V18M15 6v14.5" {...traco} />
        </>
      ) : nome === 'aparencia' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...traco} />
          <Path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill={cor} />
        </>
      ) : nome === 'apagar' ? (
        <>
          <Path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" {...traco} />
          <Path d="M10 11v6M14 11v6" {...traco} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={9} {...traco} />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.01" {...traco} />
        </>
      )}
    </Svg>
  );
}
