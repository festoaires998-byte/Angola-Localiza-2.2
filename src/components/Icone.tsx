import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { Separador } from '@/domain/organizacao/cargos';

/** Ícones simples (traço) dos separadores. */
export function Icone({ nome, cor, tamanho = 28 }: { nome: Separador; cor: ColorValue; tamanho?: number }) {
  const traco = { stroke: cor, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" accessibilityElementsHidden>
      {nome === 'mapa' ? (
        <>
          <Path d="M12 22s7-7.6 7-13a7 7 0 0 0-14 0c0 5.4 7 13 7 13z" {...traco} />
          <Circle cx={12} cy={9} r={2.6} {...traco} />
        </>
      ) : nome === 'guardados' ? (
        <Path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z" {...traco} />
      ) : nome === 'entrega' ? (
        <>
          <Path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" {...traco} />
          <Path d="M3 7.5l9 4.5 9-4.5M12 12v9" {...traco} />
        </>
      ) : nome === 'minhas-entregas' ? (
        <>
          <Rect x={2} y={6} width={12} height={10} rx={1} {...traco} />
          <Path d="M14 9h4l3 3.5V16h-7z" {...traco} />
          <Circle cx={6.5} cy={18} r={2} {...traco} />
          <Circle cx={17} cy={18} r={2} {...traco} />
        </>
      ) : nome === 'campo' ? (
        <>
          <Rect x={5} y={4} width={14} height={18} rx={2} {...traco} />
          <Rect x={9} y={2} width={6} height={4} rx={1} {...traco} />
          <Path d="M8.5 11h7M8.5 15h7M8.5 19h4" {...traco} />
        </>
      ) : nome === 'validar' ? (
        <>
          <Circle cx={12} cy={12} r={9.5} {...traco} />
          <Path d="M7.5 12.5l3 3 6-6.5" {...traco} />
        </>
      ) : nome === 'admin' ? (
        <Path d="M12 2.5l8 3v6c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5v-6z" {...traco} />
      ) : (
        <>
          <Path d="M4 6h16M4 12h16M4 18h16" {...traco} />
          <Circle cx={9} cy={6} r={2.2} fill="#FFFFFF" stroke={cor} strokeWidth={2.2} />
          <Circle cx={15} cy={12} r={2.2} fill="#FFFFFF" stroke={cor} strokeWidth={2.2} />
          <Circle cx={8} cy={18} r={2.2} fill="#FFFFFF" stroke={cor} strokeWidth={2.2} />
        </>
      )}
    </Svg>
  );
}
