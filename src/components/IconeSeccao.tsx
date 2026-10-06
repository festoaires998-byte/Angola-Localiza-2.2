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
  | 'ajuda';

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
      ) : (
        <>
          <Circle cx={12} cy={12} r={9} {...traco} />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.01" {...traco} />
        </>
      )}
    </Svg>
  );
}
