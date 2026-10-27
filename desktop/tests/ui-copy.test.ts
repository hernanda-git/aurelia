import { describe, expect, it } from 'vitest';
import { interfaceCopy } from '../src/shared/ui-copy';
describe('display-only interface terminology',()=>{
 it('normalizes historical generated messages without rewriting persisted input',()=>{
  const message='PES Focus: 8 tugas aktif tersimpan. Tugas berikutnya. TUGAS.';
  expect(interfaceCopy(message)).toBe('PES: 8 tasks aktif tersimpan. Tasks berikutnya. TASKS.');
  expect(message).toBe('PES Focus: 8 tugas aktif tersimpan. Tugas berikutnya. TUGAS.');
  expect(interfaceCopy('TaskNo M03938/Task. IT/1026; penugasan')).toBe('TaskNo M03938/Task. IT/1026; penugasan');
 });
});
