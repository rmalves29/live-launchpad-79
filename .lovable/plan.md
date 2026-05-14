Aumentar tamanho da logo e das fontes da sidebar (`src/components/layout/AppSidebar.tsx`):

**Logo (+30%)**
- Desktop: `h-[3.3rem]` → `h-[4.3rem]`
- Mobile (top bar): `h-[2.625rem]` → `h-[3.4rem]` (e ajustar altura da barra `h-12` → `h-14` para acomodar)

**Fontes (+10%)**
- Itens de navegação: `text-[13px]` → `text-[14px]`
- Rótulos de grupo (PRINCIPAL, GESTÃO...): `text-[10px]` → `text-[11px]`
- Botão "Sair" / "Entrar": `text-[13px]` → `text-[14px]`
- Ícones acompanham levemente: `w-4 h-4` → `w-[18px] h-[18px]` para manter proporção visual

**Largura da sidebar**
- `width: 220` → `width: 240` para evitar quebra de texto com fonte maior

Nenhuma outra página é afetada — alterações restritas ao componente da sidebar.