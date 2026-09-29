import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
const root=join(__dirname,'..');
const ler=(p:string)=>readFileSync(join(root,p),'utf8');
describe('módulo Validar na APP',()=>{
 test('o ecrã deixou de ser EmConstrucao e contém as decisões do site',()=>{
  const s=ler('app/(tabs)/validar.tsx');
  expect(s).not.toContain('EmConstrucao');
  expect(s).toContain('Levantamentos de campo por validar.');
  expect(s).toContain('Aprovar');
  expect(s).toContain('Duplicado');
  expect(s).toContain('Fundir com existente');
  expect(s).toContain('Aceitar como novo');
  expect(s).toContain('Rejeitar');
  expect(s).toContain('Ver a quadra onde estou agora');
  expect(s).toContain('Gestão de quadra/ruas');
 });
 test('o backend mantém duplicados automáticos em revisão até decisão final',()=>{
   const s=ler('supabase/functions/field-service/index.ts');
   expect(s).toContain('status.eq.PENDING_REVIEW');
   expect(s).toContain('status.eq.DUPLICATE');
   expect(s).toContain('validated_at.is.null');
   expect(s).toContain('["PENDING_REVIEW", "DUPLICATE"]');
  expect(s).toContain('VALIDATION_IN_PROGRESS');
 });
 test('o serviço usa as ações protegidas do field-service',()=>{
  const s=ler('services/validacao/validacao.ts');
  expect(s).toContain("'field-service', 'list_pending'");
  expect(s).toContain("'field-service', 'validate'");
  expect(s).toContain("decision: DecisaoValidacao");
 });
});
