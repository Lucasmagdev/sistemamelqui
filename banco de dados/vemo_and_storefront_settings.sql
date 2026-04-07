-- Canonicaliza Vemo como metodo oficial de pagamento e replica configuracoes legadas.

UPDATE public.orders
SET payment_method = 'vemo'
WHERE LOWER(COALESCE(payment_method, '')) = 'veo';

UPDATE public.store_sales
SET payment_method = 'vemo'
WHERE LOWER(COALESCE(payment_method, '')) = 'veo';

INSERT INTO public.settings (tenant_id, chave, valor)
SELECT tenant_id, 'vemo_qr_code_base64', valor
FROM public.settings legacy
WHERE legacy.chave = 'veo_qr_code_base64'
  AND NOT EXISTS (
    SELECT 1
    FROM public.settings current_setting
    WHERE current_setting.tenant_id = legacy.tenant_id
      AND current_setting.chave = 'vemo_qr_code_base64'
  );

INSERT INTO public.settings (tenant_id, chave, valor)
SELECT tenant_id, 'vemo_payment_link', valor
FROM public.settings legacy
WHERE legacy.chave = 'veo_payment_link'
  AND NOT EXISTS (
    SELECT 1
    FROM public.settings current_setting
    WHERE current_setting.tenant_id = legacy.tenant_id
      AND current_setting.chave = 'vemo_payment_link'
  );
