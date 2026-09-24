# src/domain/identidade

Domínio 4: KYC e desafio de vivacidade.

## Verificação simples do cidadão (`verificacaoSimples.ts`)

Obrigatória para o cidadão registar moradas (o servidor recusa sem ela).
Fotos: **BI frente**, **BI verso** e **duas selfies**: a segunda com um gesto
pedido ao acaso (`escolherDesafio`). As duas selfies vão juntas, lado a lado,
numa só imagem (a "selfie" que o servidor pede), com o gesto e a hora na marca
de água. Não é deteção automática de vivacidade: é prova para uma revisão.
Ficheiros no bucket **privado** `kyc-artifacts`, com o nome
`cidadao-<user_id>-<frente|verso|selfie>-<hora>.jpg` (`nomeNoBucket`).

