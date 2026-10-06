import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IconeSeccao, type NomeSeccao } from './IconeSeccao';
import { type CorPastilha } from './tema';
import { useTema } from './temaApp';

/**
 * Desenho simples para os ecrãs vazios (ainda sem moradas, envios, ...):
 * um círculo grande com o ícone da secção e uns "sóis" à volta. Sem imagens
 * para descarregar: é desenhado no telemóvel.
 */
export function IlustracaoVazio({ icone, cor = 'verde' }: { icone: NomeSeccao; cor?: CorPastilha }) {
  const { pastilhas, cores } = useTema();
  const [corIcone, fundo] = pastilhas[cor];
  return (
    <View testID={`vazio-${icone}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'center', width: 160, height: 140 }}>
      <Svg width={160} height={140} viewBox="0 0 160 140" style={{ position: 'absolute' }}>
        <Circle cx={80} cy={72} r={56} fill={fundo} />
        <Circle cx={134} cy={30} r={9} fill={cores.destaque} opacity={0.85} />
        <Circle cx={24} cy={108} r={6} fill={cores.destaque} opacity={0.6} />
        <Circle cx={30} cy={34} r={4} fill={corIcone} opacity={0.35} />
      </Svg>
      <View style={{ position: 'absolute', left: 52, top: 44 }}>
        <IconeSeccao nome={icone} cor={corIcone} tamanho={56} />
      </View>
    </View>
  );
}
