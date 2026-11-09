import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ajustarDimensoes,
  CAIXA_MINI_ENVIOS_CM,
  codigosParaTentar,
  parseCodigosServico,
  servicoDoPedido,
} from "./correios-prepostagem.ts";

// Contrato da Francisca Joias: PAC 03298 e SEDEX 03220 (não tem 04669/04162)
const FRANCISCA = parseCodigosServico({ PAC: "03298", SEDEX: "03220" });
const CAIXA = { altura: 6, largura: 11, comprimento: 10 };

Deno.test("parseCodigosServico: aceita objeto ou JSON, completa o zero e ignora lixo", () => {
  assertEquals(parseCodigosServico({ PAC: "3298", SEDEX: "03220", "Mini Envios": "abc" }), { PAC: "03298", SEDEX: "03220" });
  assertEquals(parseCodigosServico('{"PAC":"03298"}'), { PAC: "03298" });
  assertEquals(parseCodigosServico(null), {});
  assertEquals(parseCodigosServico("não é json"), {});
  assertEquals(parseCodigosServico(["03298"]), {});
});

Deno.test("sem códigos do contrato, nada muda (outras empresas continuam com os códigos padrão)", () => {
  assertEquals(servicoDoPedido(null, 4669), "04669");
  assertEquals(servicoDoPedido("[FRETE] Correios - PAC | R$ 20", null), "04669");
  assertEquals(servicoDoPedido("[FRETE] Correios - SEDEX | R$ 30", null), "04162");
  assertEquals(servicoDoPedido(null, 4227), "04227");
  assertEquals(codigosParaTentar("04669"), ["04669", "03298"]);
  assertEquals(codigosParaTentar("03220"), ["03220", "04162"]);
});

Deno.test("com os códigos da Francisca, PAC e SEDEX saem no código do contrato dela", () => {
  // pedido gravado com o código padrão antigo do sistema
  assertEquals(servicoDoPedido(null, 4669, FRANCISCA), "03298");
  assertEquals(servicoDoPedido(null, 4162, FRANCISCA), "03220");
  // pedido já gravado com o código dela (o zero à esquerda se perde: 3298 = 03298)
  assertEquals(servicoDoPedido(null, 3298, FRANCISCA), "03298");
  assertEquals(servicoDoPedido(null, 3220, FRANCISCA), "03220");
  // pedido sem código: vale o nome na observação
  assertEquals(servicoDoPedido("[FRETE] Correios - PAC | R$ 20", null, FRANCISCA), "03298");
  assertEquals(servicoDoPedido("[FRETE] Correios - SEDEX | R$ 30", null, FRANCISCA), "03220");
  // sem informação nenhuma, continua avisando em vez de adivinhar
  assertEquals(servicoDoPedido("frete grátis", null, FRANCISCA), null);
});

Deno.test("código cadastrado no contrato é o único tentado (não cai no código de outro contrato)", () => {
  assertEquals(codigosParaTentar("03298", FRANCISCA), ["03298"]);
  assertEquals(codigosParaTentar("03220", FRANCISCA), ["03220"]);
});

Deno.test("Mini Envios: caixa fixa vale para o código padrão e para o código do contrato", () => {
  assertEquals(servicoDoPedido(null, 4227, FRANCISCA), "04227");
  assertEquals(ajustarDimensoes("04227", CAIXA, FRANCISCA), { ...CAIXA_MINI_ENVIOS_CM });
  const comMiniProprio = parseCodigosServico({ "Mini Envios": "04999" });
  assertEquals(ajustarDimensoes("04999", CAIXA, comMiniProprio), { ...CAIXA_MINI_ENVIOS_CM });
  assertEquals(ajustarDimensoes("03298", CAIXA, FRANCISCA), CAIXA);
});
