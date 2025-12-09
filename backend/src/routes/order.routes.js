import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/orders/:tenantId
 * Listar pedidos de um tenant
 */
router.get('/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      total: data.length,
      orders: data
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao buscar pedidos',
      message: error.message
    });
  }
});

/**
 * POST /api/orders
 * Criar novo pedido
 */
router.post('/', async (req, res) => {
  try {
    const orderData = req.body;

    const { data, error } = await supabase
      .from('orders')
      .insert([orderData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao criar pedido',
      message: error.message
    });
  }
});

/**
 * PATCH /api/orders/:id
 * Atualizar pedido
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao atualizar pedido',
      message: error.message
    });
  }
});

export default router;
