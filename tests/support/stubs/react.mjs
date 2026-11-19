// Os testes usam só as funções puras dos módulos do front; hooks do React não rodam aqui.
const noHooks = (name) => () => { throw new Error(`[tests] ${name} do React não roda nos testes de lógica`); };
export const useState = noHooks('useState');
export const useEffect = noHooks('useEffect');
export const useCallback = noHooks('useCallback');
export const useMemo = noHooks('useMemo');
export const useRef = noHooks('useRef');
export default { useState, useEffect, useCallback, useMemo, useRef };
