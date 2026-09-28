import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { Caixa, Botao, Cartao, Campo, EcraCarregamento, Subtitulo, Texto, Titulo } from '@/components/ui';
import { useOnline } from '@/hooks/useOnline';
import { useSessao } from '@/hooks/useSessao';
import { supabase } from '@/api/supabase';
import { driverKyc, type DriverStatus } from '@/services/motorista/driverKyc';

type DocKey = 'id'|'licenseFront'|'licenseBack'|'vehicle'|'selfie';
type Docs = Partial<Record<DocKey,string>>;

export default function Motorista() {
  const { utilizador } = useSessao();
  const online = useOnline();
  const [estado,setEstado]=useState<DriverStatus|null>(null);
  const [docs,setDocs]=useState<Docs>({});
  const [vehicleType,setVehicleType]=useState('');
  const [plate,setPlate]=useState('');
  const [license,setLicense]=useState('');
  const [expiry,setExpiry]=useState('');
  const [erro,setErro]=useState<string|null>(null);
  const [ok,setOk]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function ler(){ if(!online) return; try{setEstado(await driverKyc.status());}catch(e){setErro(e instanceof Error?e.message:'Não foi possível ler o estado.');} }
  useEffect(()=>{void ler();},[online]);

  if(!utilizador) return <EcraCarregamento texto="A abrir…" />;
  const userId = userId;

  async function foto(chave:DocKey,label:string){
    setErro(null);
    const p=await ImagePicker.requestCameraPermissionsAsync();
    if(!p.granted){setErro('Autoriza a câmara para enviar este documento.');return;}
    const r=await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:0.88});
    if(r.canceled||!r.assets[0]?.uri)return;
    setBusy(true);
    try{
      const res=await fetch(r.assets[0].uri); const blob=await res.blob();
      const path=`${userId}/driver/${chave}-${Date.now()}.jpg`;
      const up=await supabase.storage.from('kyc-artifacts').upload(path,blob,{contentType:'image/jpeg',upsert:false});
      if(up.error)throw new Error(up.error.message);
      setDocs(d=>({...d,[chave]:path})); setOk(`${label} enviado.`);
    }catch(e){setErro(e instanceof Error?e.message:'Não foi possível enviar o documento.');}
    finally{setBusy(false);}
  }

  async function enviar(){
    setErro(null);setOk(null);
    const missing=(['id','licenseFront','licenseBack','vehicle','selfie'] as DocKey[]).filter(k=>!docs[k]);
    if(missing.length){setErro('Faltam documentos/fotografias obrigatórios.');return;}
    if(!vehicleType.trim()||!plate.trim()||!license.trim()){setErro('Preenche tipo de veículo, matrícula e número da carta.');return;}
    setBusy(true);
    try{
      await driverKyc.submit({vehicle_type:vehicleType,vehicle_plate:plate,license_number:license,license_expiry:expiry||null,
        id_document_path:docs.id,license_front_path:docs.licenseFront,license_back_path:docs.licenseBack,
        vehicle_document_path:docs.vehicle,selfie_path:docs.selfie});
      setOk('Candidatura enviada. A equipa irá rever os documentos.');
      await ler();
    }catch(e){setErro(e instanceof Error?e.message:'Não foi possível enviar a candidatura.');}
    finally{setBusy(false);}
  }

  const app=estado?.application;
  if(app?.status==='APPROVED') return <ScrollView contentContainerStyle={{padding:16,gap:12}}><Titulo>Motorista</Titulo><Caixa tipo="sucesso">Candidatura aprovada ✅</Caixa><Texto>País: {app.country_code}. O perfil operacional está aprovado, mas começa offline até ativares o modo motorista.</Texto></ScrollView>;
  if(app?.status==='PENDING_REVIEW') return <ScrollView contentContainerStyle={{padding:16,gap:12}}><Titulo>Motorista</Titulo><Caixa tipo="info">Candidatura em revisão. Não precisas reenviar os documentos.</Caixa><Botao titulo="Atualizar estado" variante="secundario" onPress={()=>void ler()} /></ScrollView>;
  if(app?.status==='REJECTED') return <ScrollView contentContainerStyle={{padding:16,gap:12}}><Titulo>Motorista</Titulo><Caixa tipo="erro">{`Candidatura recusada: ${app.rejection_reason||'sem motivo indicado'}`}</Caixa></ScrollView>;

  return <ScrollView contentContainerStyle={{padding:16,gap:12}}>
    <Titulo>Motorista / KYC</Titulo>
    <Texto>O país da candidatura é o país associado à tua conta: {estado?.profile?.country_code ?? 'será definido pelo servidor'}.</Texto>
    <Cartao><Subtitulo>Dados do veículo</Subtitulo>
      <Campo rotulo="Tipo de veículo" value={vehicleType} onChangeText={setVehicleType} placeholder="Moto, carro, carrinha…" />
      <Campo rotulo="Matrícula" value={plate} onChangeText={setPlate} placeholder="Matrícula" />
      <Campo rotulo="Número da carta" value={license} onChangeText={setLicense} placeholder="Número da carta de condução" />
      <Campo rotulo="Validade da carta (AAAA-MM-DD)" value={expiry} onChangeText={setExpiry} placeholder="AAAA-MM-DD" />
    </Cartao>
    <Cartao><Subtitulo>Documentos</Subtitulo>
      {([['id','BI/identificação'],['licenseFront','Carta — frente'],['licenseBack','Carta — verso'],['vehicle','Documento do veículo'],['selfie','Selfie do candidato']] as [DocKey,string][]).map(([k,l])=><Botao key={k} titulo={docs[k]?`✓ ${l}`:`Fotografar: ${l}`} variante={docs[k]?'secundario':'primario'} onPress={()=>void foto(k,l)} aCarregar={busy}/>)}
    </Cartao>
    {erro?<Caixa tipo="erro">{erro}</Caixa>:null}{ok?<Caixa tipo="sucesso">{ok}</Caixa>:null}
    <Botao titulo="Enviar candidatura a Motorista" onPress={()=>void enviar()} aCarregar={busy} />
    <Texto suave>Os documentos ficam no bucket privado de KYC. A aprovação e o estado operacional são controlados pelo servidor.</Texto>
  </ScrollView>;
}
