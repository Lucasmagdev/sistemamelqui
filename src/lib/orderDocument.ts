type OrderDocumentDetail = {
  branding: {
    nomeEmpresa: string;
    corPrimaria: string;
    logoUrl?: string | null;
  };
  order: {
    id: number;
    data_pedido?: string | null;
    status?: number | null;
    notes?: string | null;
  };
  client?: {
    nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    cidade?: string | null;
  } | null;
  orderCode: string;
  paymentMethodLabel: string;
  deliveryAddress?: string | null;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    cutType?: string | null;
    notes?: string | null;
  }>;
};

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const hexToRgb = (hex: string) => {
  const normalized = String(hex || "").replace("#", "").trim();
  if (normalized.length !== 6) return { r: 212, g: 175, b: 55 };
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return { r: 212, g: 175, b: 55 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao converter logo."));
    reader.readAsDataURL(blob);
  });

const loadLogoDataUrl = async (logoUrl?: string | null) => {
  if (!logoUrl) return null;
  try {
    const resolvedUrl = logoUrl.startsWith("http") ? logoUrl : `${window.location.origin}${logoUrl}`;
    const response = await fetch(resolvedUrl);
    if (!response.ok) return null;
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
};

export const buildOrderDocumentHtml = (detail: OrderDocumentDetail) => {
  const total = detail.items.reduce((acc, item) => acc + Number(item.totalPrice || 0), 0);
  const statusLabel =
    detail.order?.status === 6
      ? "Cancelado"
      : detail.order?.status === 5
        ? "Concluido"
        : detail.order?.status === 4
          ? "Saiu para entrega"
          : detail.order?.status === 3
            ? "Pronto"
            : detail.order?.status === 2
              ? "Em preparacao"
              : detail.order?.status === 1
                ? "Confirmado"
                : "Pedido recebido";
  const itemsRows = detail.items
    .map((item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #ddd;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">${item.quantity} ${item.unit}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">${money(item.unitPrice)}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${money(item.totalPrice)}</td>
      </tr>
    `)
    .join("");

  return `
    <html>
      <head>
        <title>Documento ${detail.orderCode}</title>
      </head>
      <body style="font-family:Arial,sans-serif;padding:24px;color:#111;background:#f7f7f7;">
        <div style="max-width:920px;margin:0 auto;background:#fff;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,0.08);">
          <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;background:#111;color:#fff;border-radius:18px;padding:22px 24px;">
            <div style="display:flex;gap:16px;align-items:flex-start;">
              ${detail.branding.logoUrl ? `<img src="${detail.branding.logoUrl}" alt="Logo" style="height:60px;width:60px;object-fit:contain;border-radius:14px;background:#fff;padding:6px;" />` : ""}
              <div>
                <h1 style="margin:0 0 6px;font-size:28px;">${detail.branding.nomeEmpresa}</h1>
                <div style="font-size:13px;color:#d4d4d4;">Documento fiscal visual do pedido</div>
                <div style="margin-top:8px;font-size:14px;color:#f1f1f1;">${detail.orderCode}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px;color:#cfcfcf;">Status</div>
              <div style="margin-top:6px;font-size:15px;font-weight:700;">${statusLabel}</div>
              <div style="margin-top:10px;font-size:12px;color:#cfcfcf;">Pagamento</div>
              <div style="margin-top:4px;font-size:15px;font-weight:700;">${detail.paymentMethodLabel}</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:22px;">
            <div style="border:1px solid #e5e5e5;border-radius:16px;padding:18px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#666;">Cliente</div>
              <div style="margin-top:12px;font-size:15px;line-height:1.7;">
                <div><strong>Nome:</strong> ${detail.client?.nome || "-"}</div>
                <div><strong>Telefone:</strong> ${detail.client?.telefone || "-"}</div>
                <div><strong>Email:</strong> ${detail.client?.email || "-"}</div>
                <div><strong>Cidade:</strong> ${detail.client?.cidade || "-"}</div>
              </div>
            </div>
            <div style="border:1px solid #e5e5e5;border-radius:16px;padding:18px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#666;">Entrega e pedido</div>
              <div style="margin-top:12px;font-size:15px;line-height:1.7;">
                <div><strong>Data:</strong> ${detail.order?.data_pedido ? new Date(detail.order.data_pedido).toLocaleString("pt-BR") : "-"}</div>
                <div><strong>Endereco:</strong> ${detail.deliveryAddress || "-"}</div>
                <div><strong>Observacoes:</strong> ${detail.order?.notes || "-"}</div>
              </div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-top:22px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Produto</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Quantidade</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Valor unitario</th>
              <th style="text-align:right;padding:8px;border-bottom:2px solid #222;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
          <h2 style="text-align:right;margin-top:24px;">Total: ${money(total)}</h2>
        </div>
      </body>
    </html>
  `;
};

export const printOrderDocument = (detail: OrderDocumentDetail) => {
  const receiptWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!receiptWindow) throw new Error("Nao foi possivel abrir o documento.");
  receiptWindow.document.write(buildOrderDocumentHtml(detail));
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
};

export const downloadOrderDocumentPdf = async (detail: OrderDocumentDetail) => {
  const module = await import("jspdf");
  const jsPDFConstructor = module.jsPDF;
  const doc = new jsPDFConstructor({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 42;
  const right = pageWidth - 42;
  const { r, g, b } = hexToRgb(detail.branding.corPrimaria);
  const total = detail.items.reduce((acc, item) => acc + Number(item.totalPrice || 0), 0);
  let y = 42;

  const ensureSpace = (required = 20) => {
    if (y + required <= pageHeight - 48) return;
    doc.addPage();
    y = 42;
  };

  doc.setFillColor(16, 16, 16);
  doc.roundedRect(left, y, right - left, 128, 16, 16, "F");

  const logoDataUrl = await loadLogoDataUrl(detail.branding.logoUrl);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", left + 18, y + 18, 88, 54, undefined, "FAST");
    } catch {
      // noop
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text(detail.branding.nomeEmpresa || "Sabor Imperial", logoDataUrl ? left + 122 : left + 20, y + 34);
  doc.setFontSize(10);
  doc.setTextColor(214, 214, 214);
  doc.text("Documento fiscal visual do pedido", logoDataUrl ? left + 122 : left + 20, y + 54);
  doc.text(detail.orderCode, logoDataUrl ? left + 122 : left + 20, y + 72);
  doc.text(`Pagamento: ${detail.paymentMethodLabel}`, left + 20, y + 96);
  doc.text(`Data: ${detail.order?.data_pedido ? new Date(detail.order.data_pedido).toLocaleString("pt-BR") : "-"}`, left + 220, y + 96);

  y += 150;
  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Cliente", left, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  [detail.client?.nome, detail.client?.telefone, detail.client?.email, detail.deliveryAddress].filter(Boolean).forEach((line) => {
    doc.text(String(line), left, y);
    y += 16;
  });

  y += 8;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.text("Itens", left, y);
  y += 18;
  doc.setFont("helvetica", "normal");

  detail.items.forEach((item) => {
    ensureSpace(50);
    doc.text(item.name, left, y);
    doc.text(`${item.quantity} ${item.unit}`, left + 260, y);
    doc.text(money(item.unitPrice), left + 350, y);
    doc.text(money(item.totalPrice), right - 70, y, { align: "right" });
    y += 16;
    if (item.cutType || item.notes) {
      doc.setTextColor(95, 95, 95);
      doc.setFontSize(9);
      doc.text([item.cutType ? `Corte: ${item.cutType}` : "", item.notes ? `Obs: ${item.notes}` : ""].filter(Boolean).join(" | "), left, y);
      doc.setTextColor(18, 18, 18);
      doc.setFontSize(11);
      y += 14;
    }
    doc.setDrawColor(225, 225, 225);
    doc.line(left, y, right, y);
    y += 14;
  });

  ensureSpace(60);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.setFontSize(16);
  doc.text(`Total: ${money(total)}`, right, y + 12, { align: "right" });

  doc.save(`${detail.orderCode.toLowerCase()}-documento.pdf`);
};
