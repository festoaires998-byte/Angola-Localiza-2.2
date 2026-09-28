import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Botao, Caixa, Cartao, Campo, Subtitulo, Texto, Titulo } from '@/components/ui';
import { marketplace, type MarketplaceListing } from '@/services/marketplace/marketplace';

export default function Marketplace() {
  const [items,setItems]=useState<MarketplaceListing[]>([]);
  const [country,setCountry]=useState('—');
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState<string|null>(null);
  const [title,setTitle]=useState('');
  const [category,setCategory]=useState('');
  const [description,setDescription]=useState('');
  const [price,setPrice]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [creating,setCreating]=useState(false);
  const [mensagem,setMensagem]=useState<string|null>(null);

  const carregar=useCallback(async()=>{
    setLoading(true);setErro(null);
    try{const r=await marketplace.list();setCountry(r.country_code);setItems(r.listings);}
    catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar o Marketplace.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void carregar();},[carregar]);

  async function criar(){
    setMensagem(null);setErro(null);
    const valor=Number(price.replace(',','.'));const qtd=Number(quantity);
    if(title.trim().length<3||!category.trim()){setErro('Indica título e categoria.');return;}
    if(!Number.isFinite(valor)||valor<0||!Number.isInteger(qtd)||qtd<0){setErro('Preço ou quantidade inválidos.');return;}
    setCreating(true);
    try{
      const r=await marketplace.create({title,category,description,price:valor,quantity:qtd});
      await marketplace.publish(r.listing.id);
      setMensagem('Anúncio publicado no país da tua conta.');
      setTitle('');setCategory('');setDescription('');setPrice('');setQuantity('1');
      await carregar();
    }catch(e){setErro(e instanceof Error?e.message:'Não foi possível publicar o anúncio.');}
    finally{setCreating(false);}
  }

  return <ScrollView contentContainerStyle={estilos.conteudo} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void carregar()} />}>
    <Titulo>Marketplace</Titulo>
    <Texto suave>{`Anúncios ativos em ${country}. O país é determinado pelo perfil da tua conta.`}</Texto>
    {erro?<Caixa tipo="erro">{erro}</Caixa>:null}{mensagem?<Caixa tipo="sucesso">{mensagem}</Caixa>:null}

    <Cartao>
      <Subtitulo>Publicar anúncio</Subtitulo>
      <Campo rotulo="Título" value={title} onChangeText={setTitle} placeholder="Ex.: Telemóvel usado" />
      <Campo rotulo="Categoria" value={category} onChangeText={setCategory} placeholder="Eletrónica, roupa, serviços…" />
      <Campo rotulo="Descrição" value={description} onChangeText={setDescription} placeholder="Descrição do produto ou serviço" />
      <Campo rotulo="Preço" value={price} onChangeText={setPrice} placeholder="0,00" keyboardType="decimal-pad" />
      <Campo rotulo="Quantidade" value={quantity} onChangeText={setQuantity} placeholder="1" keyboardType="number-pad" />
      <Botao titulo={creating?'A publicar…':'Publicar anúncio'} aCarregar={creating} onPress={()=>void criar()} />
      <Texto suave>O anúncio começa como rascunho e só é publicado depois de passar pela validação do servidor.</Texto>
    </Cartao>

    <Cartao>
      <Subtitulo>Anúncios disponíveis</Subtitulo>
      {items.length===0&&!loading?<Texto>Não há anúncios ativos neste país.</Texto>:null}
      {items.map(item=><View key={item.id} style={estilos.item}>
        <Subtitulo>{item.title}</Subtitulo>
        <Texto>{item.description||'Sem descrição.'}</Texto>
        <Texto>{item.price.toLocaleString('pt-PT',{minimumFractionDigits:2})} {item.currency} · {item.quantity} disponível(s)</Texto>
        <Texto suave>{item.category}</Texto>
      </View>)}
    </Cartao>
  </ScrollView>;
}

const estilos=StyleSheet.create({
  conteudo:{padding:16,gap:12},
  item:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#ddd',gap:4},
});
