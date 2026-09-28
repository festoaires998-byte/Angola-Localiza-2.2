import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Botao, Caixa, Cartao, Campo, Subtitulo, Texto, Titulo } from '@/components/ui';
import { marketplace, marketplaceServices, marketplaceServiceFlow, type MarketplaceCategory, type MarketplaceListing, type MarketplaceProvider } from '@/services/marketplace/marketplace';

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
 const [providerRating,setProviderRating]=useState<{average:number;count:number}|null>(null); const [detail,setDetail]=useState<{listing:MarketplaceListing;images:{id:string;storage_path:string;sort_order:number;url:string}[];similar:MarketplaceListing[]}|null>(null);
 const [detailLoading,setDetailLoading]=useState(false);
 const [serviceRequestOpen,setServiceRequestOpen]=useState(false); const [serviceRequests,setServiceRequests]=useState<any[]>([]); const [openRequests,setOpenRequests]=useState<any[]>([]); const [proposals,setProposals]=useState<any[]>([]); const [proposalMessage,setProposalMessage]=useState(''); const [proposalAmount,setProposalAmount]=useState(''); const [proposalBusy,setProposalBusy]=useState(false); const [rating,setRating]=useState(''); const [reviewComment,setReviewComment]=useState(''); const [requestTitle,setRequestTitle]=useState(''); const [requestDescription,setRequestDescription]=useState(''); const [requestBudget,setRequestBudget]=useState(''); const [requestDate,setRequestDate]=useState(''); const [requestBusy,setRequestBusy]=useState(false); const [bookings,setBookings]=useState<Array<Record<string,unknown>>>([]);

 const carregar=useCallback(async()=>{
  setLoading(true);setErro(null);
  try{const [r,c]=await Promise.all([marketplace.list({q:q||undefined,category:category||undefined}),marketplace.categories()]);
   setCountry(r.country_code);setCurrency(r.currency);setItems(r.listings);setCats(c.categories);
  }catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar o Marketplace.');} finally{setLoading(false);}
 },[q,category]);
 useEffect(()=>{void carregar();},[carregar]);
 async function criarPedidoServico(){
  if(!requestTitle.trim()||requestDescription.trim().length<10){setErro('Indica um título e uma descrição com pelo menos 10 caracteres.');return;}
  setRequestBusy(true);setErro(null);setMensagem(null);
  try{const budget=requestBudget.trim()===''?null:Number(requestBudget.replace(',','.'));if(budget!==null&&(!Number.isFinite(budget)||budget<0))throw new Error('ORCAMENTO_INVALIDO');
   await marketplaceServices.request({title:requestTitle.trim(),description:requestDescription.trim(),category:serviceCategory.trim()||'outros',budget_max:budget,preferred_date:requestDate.trim()||null});
   setMensagem('Pedido de serviço publicado. Os prestadores compatíveis poderão enviar propostas.');setRequestTitle('');setRequestDescription('');setRequestBudget('');setRequestDate('');setServiceRequestOpen(false);
  }catch(e){setErro(e instanceof Error?e.message:'Não foi possível publicar o pedido.');}finally{setRequestBusy(false);}
 }
 async function carregarFluxoServico(){
  setLoading(true);setErro(null);
  try{const [mine,open,props]=await Promise.all([marketplaceServices.myRequests(),marketplaceServices.openRequests(),marketplaceServices.myProposals()]);setServiceRequests(mine.requests||[]);setOpenRequests(open.requests||[]);setProposals(props.proposals||[]);}
  catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar pedidos e propostas.');}finally{setLoading(false);}
 }
 async function verPropostas(requestId:string){try{const r=await marketplaceServiceFlow.requestDetail(requestId);setProposals(r.proposals||[]);}catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar as propostas.');}}
 async function aceitarProposta(id:string){setProposalBusy(true);setErro(null);try{await marketplaceServices.acceptProposal(id);await carregarFluxoServico();await carregarAgendamentos();setMensagem('Proposta aceite e agendamento criado.');}catch(e){setErro(e instanceof Error?e.message:'Não foi possível aceitar a proposta.');}finally{setProposalBusy(false);}}
 async function enviarProposta(requestId:string){if(proposalMessage.trim().length<2){setErro('Escreve uma mensagem para a proposta.');return;}setProposalBusy(true);try{const amount=proposalAmount.trim()===''?null:Number(proposalAmount.replace(',','.'));if(amount!==null&&(!Number.isFinite(amount)||amount<0))throw new Error('VALOR_INVALIDO');await marketplaceServices.propose({request_id:requestId,message:proposalMessage.trim(),amount});setProposalMessage('');setProposalAmount('');setMensagem('Proposta enviada.');await carregarFluxoServico();}catch(e){setErro(e instanceof Error?e.message:'Não foi possível enviar a proposta.');}finally{setProposalBusy(false);}}
 async function avaliar(bookingId:string){const n=Number(rating);if(!Number.isInteger(n)||n<1||n>5){setErro('A avaliação deve ser de 1 a 5 estrelas.');return;}try{await marketplaceServiceFlow.review(bookingId,n,reviewComment.trim()||undefined);setRating('');setReviewComment('');setMensagem('Avaliação registada.');}catch(e){setErro(e instanceof Error?e.message:'Não foi possível registar a avaliação.');}}
 async function carregarAgendamentos(){try{const r=await marketplaceServiceFlow.bookings();setBookings(r.bookings);}catch(e){setErro(e instanceof Error?e.message:'Não foi possível carregar os agendamentos.');}}
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
  {detail.images.length>0?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.galeria}>{detail.images.map(im=><Image key={im.id} source={{uri:im.url}} style={s.imagem} />)}<Cartao><Subtitulo>Acompanhar serviços</Subtitulo>{bookings.length===0?<Texto suave>Nenhum serviço agendado.</Texto>:bookings.map((op)=><View key={String(op.id)} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#ddd'}}><Texto>{String(op.status||'—')}</Texto>{op.scheduled_date?<Texto suave>Agendado: {new Date(String(op.scheduled_date)).toLocaleString()}</Texto>:null}<Texto suave>Entrega: {op.delivery_id ? String(op.delivery_status||'CRIADA') : 'Ainda não solicitada'}</Texto></View>)}<Botao titulo="Atualizar estado" onPress={()=>void carregarAgendamentos()} /></Cartao>
</ScrollView>:<Caixa tipo='erro'>Este anúncio ainda não tem fotografias.</Caixa>}
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
   <Botao titulo="Preciso de um serviço" onPress={()=>setServiceRequestOpen(true)} />
   {serviceRequestOpen?<Cartao><Subtitulo>Novo pedido de serviço</Subtitulo>
    <Campo rotulo="Título" value={requestTitle} onChangeText={setRequestTitle} placeholder="Ex.: Preciso de um eletricista" />
    <Campo rotulo="Descrição" value={requestDescription} onChangeText={setRequestDescription} placeholder="Explica o que precisas, local e detalhes…" multiline />
    <Campo rotulo="Categoria" value={serviceCategory} onChangeText={setServiceCategory} placeholder="Ex.: eletricidade" />
    <Campo rotulo="Orçamento máximo (opcional)" value={requestBudget} onChangeText={setRequestBudget} keyboardType="decimal-pad" placeholder={currency||"Moeda local"} />
    <Campo rotulo="Data pretendida (opcional)" value={requestDate} onChangeText={setRequestDate} placeholder="AAAA-MM-DD" />
    <Botao titulo="Publicar pedido" aCarregar={requestBusy} onPress={()=>void criarPedidoServico()} /><Botao titulo="Cancelar" onPress={()=>setServiceRequestOpen(false)} />
   </Cartao>:null}
   <Botao titulo="Pedidos e propostas" onPress={()=>void carregarFluxoServico()} />
   {serviceRequests.map(r=><Cartao key={'mine-'+r.id}><Subtitulo>{r.title}</Subtitulo><Texto>{r.status}</Texto><Botao titulo="Ver propostas" onPress={()=>void verPropostas(r.id)} /></Cartao>)}
   {openRequests.map(r=><Cartao key={'open-'+r.id}><Subtitulo>Pedido: {r.title}</Subtitulo><Texto>{r.description}</Texto><Campo rotulo="Mensagem da proposta" value={proposalMessage} onChangeText={setProposalMessage} placeholder="Como podes ajudar?" multiline /><Campo rotulo="Valor" value={proposalAmount} onChangeText={setProposalAmount} keyboardType="decimal-pad" placeholder={currency||"Moeda local"} /><Botao titulo="Enviar proposta" aCarregar={proposalBusy} onPress={()=>void enviarProposta(r.id)} /></Cartao>)}
   {proposals.map(p=><Cartao key={'prop-'+p.id}><Subtitulo>Proposta</Subtitulo><Texto>{p.message}</Texto><Texto>{p.amount!==null?String(p.amount)+' '+String(p.currency||currency):'Valor sob consulta'}</Texto><Texto suave>{p.status}</Texto>{p.status==='PENDING'?<Botao titulo="Aceitar proposta" aCarregar={proposalBusy} onPress={()=>void aceitarProposta(p.id)} />:null}</Cartao>)}
      <Botao titulo="Meus agendamentos" onPress={()=>void carregarAgendamentos()} />
  </Cartao>:null}
  {modo==='servicos'&&bookings.map((b,i)=><Cartao key={String(b.id||i)}>
   <Subtitulo>Agendamento</Subtitulo><Texto>{String(b.status||'')}</Texto><Texto suave>{b.scheduled_date?String(b.scheduled_date):'Data a combinar'}</Texto>
   {b.status==='SCHEDULED'?<Botao titulo="Iniciar serviço" onPress={async()=>{await marketplaceServiceFlow.updateBooking(String(b.id),'IN_PROGRESS');await carregarAgendamentos();}} />:null}
   {b.status==='IN_PROGRESS'?<Botao titulo="Marcar como concluído" onPress={async()=>{await marketplaceServiceFlow.updateBooking(String(b.id),'COMPLETED');await carregarAgendamentos();}} />:null}
   {b.status==='COMPLETED'?<><Campo rotulo="Avaliação (1-5)" value={rating} onChangeText={setRating} keyboardType="number-pad" placeholder="5" /><Campo rotulo="Comentário (opcional)" value={reviewComment} onChangeText={setReviewComment} placeholder="Como foi o serviço?" multiline /><Botao titulo="Avaliar serviço" onPress={()=>void avaliar(String(b.id))} /></>:null}
  </Cartao>)}
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