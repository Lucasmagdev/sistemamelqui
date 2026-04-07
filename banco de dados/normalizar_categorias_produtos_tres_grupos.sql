-- Reduz o catalogo para 3 categorias canonicas: bovinos, suinos e aves.

UPDATE public.products
SET
  categoria = CASE
    WHEN lower(coalesce(categoria, '') || ' ' || coalesce(categoria_en, '')) ~ '(ave|aves|frango|chicken|hen|turkey|poultry)' THEN 'Cortes de aves'
    WHEN lower(coalesce(categoria, '') || ' ' || coalesce(categoria_en, '')) ~ '(suin|porco|pork|pig|bacon|pernil|lombo|costelinha)' THEN 'Cortes suinos'
    ELSE 'Cortes bovinos'
  END,
  categoria_en = CASE
    WHEN lower(coalesce(categoria, '') || ' ' || coalesce(categoria_en, '')) ~ '(ave|aves|frango|chicken|hen|turkey|poultry)' THEN 'Poultry Cuts'
    WHEN lower(coalesce(categoria, '') || ' ' || coalesce(categoria_en, '')) ~ '(suin|porco|pork|pig|bacon|pernil|lombo|costelinha)' THEN 'Pork Cuts'
    ELSE 'Beef Cuts'
  END;
