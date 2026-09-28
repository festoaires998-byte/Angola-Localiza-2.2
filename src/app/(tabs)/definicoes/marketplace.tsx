import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Botao, Caixa, Cartao, Campo, Subtitulo, Texto, Titulo } from '@/components/ui';
import { marketplace, marketplaceServices, type MarketplaceCategory, type MarketplaceListing, type MarketplaceProvider } from '@/services/marketplace/marketplace';

type Aba='descobrir'|'favoritos'|'meus'|'publicar';
type Modo='classificados'|'servicos';

export default function Marketplace(){
 const [aba,setAba]=useState<Aba>('descobrir');
 const [modo,setModo]=useState<Modo>('classificados');
 const [providers,setProviders]=useState<MarketplaceProvider[]>([]);
 const [providerType,setProviderType]=useState<'FREELANCER'|'BUSINESS'|''>('');
 const [serviceQ,setServiceQ]=useState('');
 const [serviceCategory,setServiceCategory]=useState('');
 const [items,setItems]=useState<MarketplaceListing[]>([]);
 const [cats,setCats]=useState<MarketplaceCategory[]>([]);
 const [country,setCountry]=useState('—'); const [currency,setCurrency]=useState('');
 const [q,setQ]=useState(''); const [category,setCategory]=useState('');
 const [loading,setLoading]=useState(true); const [erro,setErro]=useState<string|null>(null); const [mensagem,setMensagem]=useState<string|null>(null);
 const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [price,setPrice]=useState('');
 const [condition,setCondition]=useState<'NEW'|'USED'|'REFURBISHED'>('USED');
 const [province,setProvince]=useState(''); const [city,setCity]=useState(''); const [neighborhood,setNeighborhood]=useState('');
 const [files,setFiles]=useState<ImagePicker.ImagePickerAsset[]>([]); const [busy,setBusy]=useState(false);
 const [contact,setContact]=useState(''); const [selected,setSelected]=useState<MarketplaceListing|null>(null);
 const [detail,setDetail]=useState<{listing:MarketplaceListing;images:{id:string;storage_path:string;sort_order:number;url:string}[];similar:MarketplaceListing[]}|null>(null);
 const [detailLoading,setDetailLoading]=useState(false);

 const carregar=useCallback(async()=>{
  setLoading(true);setErro(null);
  try{const [r,c]=await Promise.all([marketplace.list({q:q||undefined,category:category||undefined}),marketplace.categories()]);
   setCountry(r.country_code);setCurrency(r.currency);setItems(r.listings);setCats(c.categories);
  }catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar o Marketplace.');} finally{setLoading(false);}
 },[q,category]);
 useEffect(()=>{void carregar();},[carregar]);
 async function carregarServicos(){
  setLoading(true);setErro(null);
  try{const r=await marketplaceServices.providers({q:serviceQ||undefined,category:serviceCategory||undefined,provider_type:providerType||undefined});setProviders(r.providers);}
  catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar os prestadores.');}finally{setLoading(false);}
 }
 async function favoritos(){setErro(null);setLoading(true);try{const r=await marketplace.favorites();setItems(r.listings);}catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar favoritos.');}finally{setLoading(false);}}
 async function meus(){setErro(null);setLoading(true);try{const r=await marketplace.mine();setItems(r.listings);}catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar os teus anúncios.');}finally{setLoading(false);}}
 useEffect(()=>{if(aba==='favoritos')void favoritos();if(aba==='meus')void meus();},[aba]);
 async function escolherFotos(){
  const p=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!p.granted){setErro('É necessário permitir acesso às fotografias para adicionar imagens.');return;}
  const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,allowsMultipleSelection:true,selectionLimit:10,quality:0.82});
  if(!r.canceled)setFiles(r.assets.slice(0,10));
 }
 async function publicar(){
  setBusy(true);setErro(null);setMensagem(null);
  try{
   const valor=price.trim()===''?null:Number(price.replace(',','.'));
   if(valor!==null&&(!Number.isFinite(valor)||valor<0))throw new Error('PRECO_INVALIDO');
   const r=await marketplace.create({title,description,category,price:valor,condition,province,city,neighborhood,contact_message:true});
   for(let i=0;i<files.length;i++)await marketplace.enviarImagem(r.listing.id,{uri:files[i].uri,name:files[i].fileName||('imagem-'+i+'.jpg'),type:files[i].mimeType},i);
   await marketplace.publish(r.listing.id);
   setMensagem('Anúncio publicado com sucesso.');setTitle('');setDescription('');setPrice('');setProvince('');setCity('');setNeighborhood('');setFiles([]);setCategory('');setAba('meus');
  }catch(e){setErro(e instanceof Error?e.message:'Não foi possível publicar o anúncio.');}finally{setBusy(false);}
 }
 async function interesse(){
  if(!selected||!contact.trim())return;setBusy(true);setErro(null);
  try{await marketplace.interest(selected.id,contact.trim());setMensagem('Mensagem enviada ao anunciante.');setContact('');setSelected(null);}
  catch(e){setErro(e instanceof Error?e.message:'Não foi possível contactar o anunciante.');}finally{setBusy(false);}
 }
 async function abrirDetalhe(id:string){setDetailLoading(true);setErro(null);try{setDetail(await marketplace.detail(id));}catch(e){setErro(e instanceof Error?e.message:'Não foi possível abrir o anúncio.');}finally{setDetailLoading(false);}}
 const tituloAba=useMemo(()=>({descobrir:'Descobrir',favoritos:'Favoritos',meus:'Meus anúncios',publicar:'Publicar anúncio'}[aba]),[aba]);
 if(detail)return <ScrollView contentContainerStyle={s.conteudo}>
  <Botao titulo="← Voltar aos anúncios" onPress={()=>setDetail(null)} />
  {erro?<Caixa tipo='erro'>{erro}</Caixa>:null}
  <Titulo>{detail.listing.title}</Titulo>
  <Texto suave>{detail.listing.category+' · '+(detail.listing.condition==='NEW'?'Novo':detail.listing.condition==='REFURBISHED'?'Recondicionado':'Usado')}</Texto>
  {detail.images.length>0?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.galeria}>{detail.images.map(im=><Image key={im.id} source={{uri:im.url}} style={s.imagem} />)}</ScrollView>:<Caixa tipo='erro'>Este anúncio ainda não tem fotografias.</Caixa>}
  {detail.listing.price!==null?<Titulo>{detail.listing.price.toLocaleString('pt-PT',{minimumFractionDigits:2})+' '+detail.listing.currency}</Titulo>:<Subtitulo>Preço sob consulta</Subtitulo>}
  <Cartao><Subtitulo>Descrição</Subtitulo><Texto>{detail.listing.description||'Sem descrição.'}</Texto></Cartao>
  <Cartao><Subtitulo>Localização</Subtitulo><Texto>{[detail.listing.neighborhood,detail.listing.city,detail.listing.province].filter(Boolean).join(' · ')||'Não indicada'}</Texto><Texto suave>{detail.listing.views_count+' visualizações'}</Texto></Cartao>
  <Cartao><Subtitulo>Vendedor</Subtitulo><Texto>Vendedor verificado pela conta Localiza</Texto><Texto suave>País: {detail.listing.country_code}</Texto><Botao titulo="Guardar favorito" onPress={()=>void marketplace.favorite(detail.listing.id,true)} /><Botao titulo="Contactar anunciante" onPress={()=>setSelected(detail.listing)} /></Cartao>
  {selected&&selected.id===detail.listing.id?<Cartao><Campo rotulo='Mensagem' value={contact} onChangeText={setContact} placeholder='Olá, ainda está disponível?' multiline /><Botao titulo='Enviar mensagem' aCarregar={busy} onPress={()=>void interesse()} /><Botao titulo='Fechar' onPress={()=>setSelected(null)} /></Cartao>:null}
  {detail.similar.length>0?<><Subtitulo>Anúncios semelhantes</Subtitulo>{detail.similar.map(x=><Cartao key={x.id}><Subtitulo>{x.title}</Subtitulo><Texto suave>{x.city||x.province||'Localização não indicada'}</Texto>{x.price!==null?<Texto>{x.price.toLocaleString('pt-PT',{minimumFractionDigits:2})+' '+x.currency}</Texto>:<Texto>Preço sob consulta</Texto>}<Botao titulo="Ver anúncio" onPress={()=>void abrirDetalhe(x.id)} /></Cartao>)}</>:null}
 </ScrollView>;

 return <ScrollView contentContainerStyle={s.conteudo} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>aba==='descobrir'?void carregar():aba==='favoritos'?void favoritos():void meus()} />}>
  <Titulo>Marketplace</Titulo><Texto suave>{country!=='—'?'Marketplace de '+country+' · '+currency:'Marketplace'}</Texto>
  <View style={s.tabs}>{(['descobrir','favoritos','meus','publicar'] as Aba[]).map(x=><Botao key={x} titulo={{descobrir:'Descobrir',favoritos:'Favoritos',meus:'Meus',publicar:'Publicar'}[x]} onPress={()=>setAba(x)} />)}</View>
  {erro?<Caixa tipo='erro'>{erro}</Caixa>:null}{mensagem?<Caixa tipo='sucesso'>{mensagem}</Caixa>:null}<Subtitulo>{tituloAba}</Subtitulo>
  <View style={s.tabs}><Botao titulo="Comprar / Vender" onPress={()=>setModo('classificados')} /><Botao titulo="Serviços" onPress={()=>{setModo('servicos');void carregarServicos();}} /></View>
  {modo==='servicos'?<Cartao>
   <Subtitulo>Encontrar profissionais e empresas</Subtitulo>
   <Campo rotulo="Pesquisar" value={serviceQ} onChangeText={setServiceQ} placeholder="Eletricista, fotógrafo, oficina…" />
   <Campo rotulo="Categoria" value={serviceCategory} onChangeText={setServiceCategory} placeholder="Categoria do serviço" />
   <View style={s.tabs}><Botao titulo="Todos" onPress={()=>setProviderType('')} /><Botao titulo="Freelancers" onPress={()=>setProviderType('FREELANCER')} /><Botao titulo="Empresas" onPress={()=>setProviderType('BUSINESS')} /></View>
   <Botao titulo="Pesquisar serviços" aCarregar={loading} onPress={()=>void carregarServicos()} />
   <Botao titulo="Preciso de um serviço" onPress={()=>setMensagem('A criação de pedidos de orçamento será disponibilizada na próxima camada.')} />
  </Cartao>:null}
  {modo==='servicos'?providers.map(p=><Cartao key={p.id}>
   <Subtitulo>{p.display_name}{p.verified?' ✓':''}</Subtitulo>
   <Texto>{p.headline||'Prestador de serviços Localiza'}</Texto>
   <Texto suave>{p.provider_type==='BUSINESS'?'Empresa':'Freelancer'} · {p.city||p.province||'Localização não indicada'}</Texto>
   {p.bio?<Texto>{p.bio}</Texto>:null}
   <Botao titulo="Ver serviços" onPress={async()=>{try{const r=await marketplaceServices.detail(p.id);setMensagem(r.services.length+' serviço(s) disponíveis para este prestador.');}catch(e){setErro(e instanceof Error?e.message:'Não foi possível abrir o perfil.');}}} />
  </Cartao>):null}

  {aba==='descobrir'?<Cartao><Campo rotulo='Pesquisar' value={q} onChangeText={setQ} placeholder='O que procuras?' /><Campo rotulo='Categoria' value={category} onChangeText={setCategory} placeholder='ex.: eletronica' /><Botao titulo='Pesquisar' aCarregar={loading} onPress={()=>void carregar()} />{cats.length>0?<Texto suave>Categorias: {cats.map(c=>c.name).join(' · ')}</Texto>:null}</Cartao>:null}
  {modo==='classificados'&&aba==='publicar'?<Cartao><Subtitulo>O teu anúncio</Subtitulo><Campo rotulo='Título' value={title} onChangeText={setTitle} placeholder='Ex.: Toyota Corolla 2018' /><Campo rotulo='Descrição' value={description} onChangeText={setDescription} placeholder='Descreve claramente o anúncio…' multiline /><Campo rotulo='Categoria' value={category} onChangeText={setCategory} placeholder='ex.: veiculos' /><Campo rotulo='Preço (opcional)' value={price} onChangeText={setPrice} placeholder={'Valor em '+(currency||'moeda local')} keyboardType='decimal-pad' /><Campo rotulo='Província' value={province} onChangeText={setProvince} placeholder='Província' /><Campo rotulo='Cidade' value={city} onChangeText={setCity} placeholder='Cidade' /><Campo rotulo='Bairro' value={neighborhood} onChangeText={setNeighborhood} placeholder='Bairro (opcional)' /><Texto suave>Estado do anúncio</Texto>
   <View style={s.tabs}>
    <Botao titulo="Novo" onPress={()=>setCondition('NEW')} />
    <Botao titulo="Usado" onPress={()=>setCondition('USED')} />
    <Botao titulo="Recondicionado" onPress={()=>setCondition('REFURBISHED')} />
   </View><Botao titulo='Escolher fotografias' onPress={()=>void escolherFotos()} />{files.length>0?<Texto>{files.length} fotografia(s) selecionada(s).</Texto>:null}<Botao titulo={busy?'A publicar…':'Publicar anúncio'} aCarregar={busy} onPress={()=>void publicar()} /><Texto suave>O servidor valida o país da conta e as imagens permanecem privadas.</Texto></Cartao>:null}
  {modo==='classificados'&&aba!=='publicar'&&items.map(item=><Cartao key={item.id}><Subtitulo>{item.title}</Subtitulo><Texto>{item.description||'Sem descrição.'}</Texto><Texto suave>{item.category+' · '+(item.condition==='NEW'?'Novo':item.condition==='REFURBISHED'?'Recondicionado':'Usado')+' · '+(item.city||item.province||'Localização não indicada')}</Texto>{item.price!==null?<Texto>{item.price.toLocaleString('pt-PT',{minimumFractionDigits:2})+' '+item.currency}</Texto>:<Texto>Preço sob consulta</Texto>}<Botao titulo="Ver anúncio" aCarregar={detailLoading} onPress={()=>void abrirDetalhe(item.id)} />
   <Botao titulo={aba==='favoritos'?'Remover favorito':'Guardar favorito'} onPress={async()=>{await marketplace.favorite(item.id,aba!=='favoritos');if(aba==='favoritos')await favoritos();}} />
   <Botao titulo='Contactar anunciante' onPress={()=>setSelected(item)} />{aba==='meus'&&item.status==='ACTIVE'?<Botao titulo='Pausar anúncio' onPress={async()=>{await marketplace.pause(item.id);await meus();}} />:null}{aba==='meus'&&item.status==='PAUSED'?<Botao titulo='Publicar novamente' onPress={async()=>{await marketplace.publish(item.id);await meus();}} />:null}</Cartao>)}
  {modo==='classificados'&&items.length===0&&!loading&&aba!=='publicar'?<Texto>Não há anúncios para mostrar.</Texto>:null}
  {selected?<Cartao><Subtitulo>Contactar: {selected.title}</Subtitulo><Campo rotulo='Mensagem' value={contact} onChangeText={setContact} placeholder='Olá, ainda está disponível?' multiline /><Botao titulo='Enviar mensagem' aCarregar={busy} onPress={()=>void interesse()} /><Botao titulo='Fechar' onPress={()=>setSelected(null)} /></Cartao>:null}
 </ScrollView>;
}
const s=StyleSheet.create({conteudo:{padding:16,gap:12},tabs:{flexDirection:'row',flexWrap:'wrap',gap:6},galeria:{gap:8},imagem:{width:280,height:220,borderRadius:12}});