import QRCode from "qrcode";

type OrderDocumentDetail = {
  branding: {
    nomeEmpresa: string;
    corPrimaria: string;
    logoUrl?: string | null;
    publicStoreUrl?: string | null;
    cnpj?: string | null;
    inscricaoEstadual?: string | null;
    endereco?: string | null;
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
};

const statusLabel = (status?: number | null) => {
  switch (status) {
    case 1:
      return "Confirmado";
    case 2:
      return "Em preparacao";
    case 3:
      return "Pronto";
    case 4:
      return "Saiu para entrega";
    case 5:
      return "Concluido";
    case 6:
      return "Cancelado";
    default:
      return "Pedido recebido";
  }
};

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
    reader.onerror = () => reject(new Error("Falha ao converter imagem."));
    reader.readAsDataURL(blob);
  });

const loadRemoteDataUrl = async (url?: string | null) => {
  if (!url) return null;
  try {
    const resolvedUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const response = await fetch(resolvedUrl);
    if (!response.ok) return null;
    return blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resolveBaseUrl = (detail: OrderDocumentDetail) => {
  const configured = String(detail.branding.publicStoreUrl || "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return configured.replace(/\/+$/, "");
    }
  }
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

const buildOrderDigitalNoteUrl = (detail: OrderDocumentDetail) => {
  const path = `/nota-digital-pedido/${detail.order.id}?codigo=${encodeURIComponent(detail.orderCode)}`;
  const baseUrl = resolveBaseUrl(detail);
  if (!baseUrl) return path;
  return new URL(path, baseUrl).toString();
};

const buildCompanyMetaLines = (detail: OrderDocumentDetail) =>
  [
    detail.branding.cnpj ? `CNPJ ${detail.branding.cnpj}` : null,
    detail.branding.inscricaoEstadual ? `IE ${detail.branding.inscricaoEstadual}` : null,
    detail.branding.endereco || null,
  ].filter(Boolean) as string[];

const buildClientLines = (detail: OrderDocumentDetail) =>
  [
    detail.client?.nome ? `Cliente: ${detail.client.nome}` : null,
    detail.client?.telefone ? `Telefone: ${detail.client.telefone}` : null,
    detail.client?.email ? `Email: ${detail.client.email}` : null,
    detail.client?.cidade ? `Cidade: ${detail.client.cidade}` : null,
  ].filter(Boolean) as string[];

const buildDeliveryLines = (detail: OrderDocumentDetail) =>
  [
    detail.deliveryAddress ? `Endereco: ${detail.deliveryAddress}` : null,
    detail.order?.notes ? `Observacoes: ${detail.order.notes}` : null,
  ].filter(Boolean) as string[];

const buildTransparencyText = () =>
  "Lei da Transparencia (Lei 12.741/2012): tributos nao calculados neste documento.";

const buildConservationText = () =>
  "Agradecemos a preferencia. Conserve os alimentos sob refrigeracao ou congelamento conforme a orientacao de preparo.";

const generateOrderQrDataUrl = async (detail: OrderDocumentDetail) =>
  QRCode.toDataURL(buildOrderDigitalNoteUrl(detail), {
    margin: 1,
    width: 240,
    color: {
      dark: "#111111",
      light: "#FFFFFF",
    },
  });

export const buildOrderDocumentHtml = async (detail: OrderDocumentDetail) => {
  const total = detail.items.reduce((acc, item) => acc + Number(item.totalPrice || 0), 0);
  const logoDataUrl = await loadRemoteDataUrl(detail.branding.logoUrl);
  const qrCodeDataUrl = await generateOrderQrDataUrl(detail);
  const companyMeta = buildCompanyMetaLines(detail);
  const clientLines = buildClientLines(detail);
  const deliveryLines = buildDeliveryLines(detail);

  const itemsRows = detail.items
    .map((item) => {
      const subDetails = [item.cutType ? `Tipo de corte: ${item.cutType}` : null, item.notes ? `Obs.: ${item.notes}` : null]
        .filter(Boolean)
        .join(" • ");

      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:0.5pt solid #d4d4d4;vertical-align:top;">
            <div style="font-weight:700;color:#111;">${escapeHtml(item.name)}</div>
            ${subDetails ? `<div style="margin-top:4px;font-size:11px;line-height:1.45;color:#666;">${escapeHtml(subDetails)}</div>` : ""}
          </td>
          <td style="padding:12px 8px;border-bottom:0.5pt solid #d4d4d4;text-align:center;vertical-align:top;">${escapeHtml(item.unit || "-")}</td>
          <td style="padding:12px 8px;border-bottom:0.5pt solid #d4d4d4;text-align:right;vertical-align:top;font-family:'JetBrains Mono','Consolas','Courier New',monospace;">${escapeHtml(Number(item.quantity || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 }))}</td>
          <td style="padding:12px 8px;border-bottom:0.5pt solid #d4d4d4;text-align:right;vertical-align:top;font-family:'JetBrains Mono','Consolas','Courier New',monospace;">${escapeHtml(money(item.unitPrice))}</td>
          <td style="padding:12px 8px;border-bottom:0.5pt solid #d4d4d4;text-align:right;vertical-align:top;font-family:'JetBrains Mono','Consolas','Courier New',monospace;font-weight:700;">${escapeHtml(money(item.totalPrice))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <html>
      <head>
        <title>Nota ${escapeHtml(detail.orderCode)}</title>
        <style>
          body {
            font-family: Inter, Roboto, "Segoe UI", Arial, sans-serif;
            color: #111;
            margin: 0;
            background: #fff;
          }
          .page {
            width: 100%;
            max-width: 980px;
            margin: 0 auto;
            padding: 28px 30px 32px;
            box-sizing: border-box;
          }
          .muted { color: #666; }
          .mono { font-family: "JetBrains Mono", "Consolas", "Courier New", monospace; }
          .tinycaps {
            font-size: 10px;
            letter-spacing: .18em;
            text-transform: uppercase;
            color: #666;
            font-weight: 700;
          }
          .thin-line {
            border-top: 0.5pt solid #cfcfcf;
          }
          .split {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 20px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .minimal-box {
            border: 0.5pt solid #d8d8d8;
            border-radius: 12px;
            padding: 14px 16px;
          }
          @media print {
            .page { max-width: none; padding: 18px 20px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div style="border-top:2px solid ${escapeHtml(detail.branding.corPrimaria || "#D4AF37")};padding-top:12px;">
            <div class="split" style="align-items:start;">
              <div>
                <div style="display:flex;gap:14px;align-items:flex-start;">
                  ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" style="width:60px;height:60px;object-fit:contain;" />` : ""}
                  <div>
                    <div style="font-size:22px;font-weight:800;line-height:1.1;">${escapeHtml(detail.branding.nomeEmpresa || "Sabor Imperial")}</div>
                    <div class="tinycaps" style="margin-top:6px;">Nota do Pedido</div>
                    ${companyMeta.length ? `<div style="margin-top:10px;font-size:12px;line-height:1.6;">${companyMeta.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>` : ""}
                  </div>
                </div>
              </div>
              <div style="text-align:right;">
                <div class="tinycaps">Identificacao</div>
                <div class="mono" style="margin-top:6px;font-size:22px;font-weight:800;">${escapeHtml(detail.orderCode)}</div>
                <div class="mono" style="margin-top:6px;font-size:12px;">${escapeHtml(formatDateTime(detail.order?.data_pedido))}</div>
              </div>
            </div>
          </div>

          <div class="thin-line" style="margin-top:18px;padding-top:18px;">
            <div class="info-grid">
              <div class="minimal-box">
                <div class="tinycaps">Cliente</div>
                <div style="margin-top:8px;font-size:13px;line-height:1.7;">
                  ${clientLines.length ? clientLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("") : "<div class='muted'>Dados do cliente indisponiveis.</div>"}
                </div>
              </div>
              <div class="minimal-box">
                <div class="tinycaps">Entrega</div>
                <div style="margin-top:8px;font-size:13px;line-height:1.7;">
                  ${deliveryLines.length ? deliveryLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("") : "<div class='muted'>Sem informacoes adicionais.</div>"}
                </div>
              </div>
            </div>
          </div>

          <div class="thin-line" style="margin-top:18px;padding-top:16px;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr>
                  <th style="padding:0 8px 10px;text-align:left;border-bottom:0.5pt solid #999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Descricao</th>
                  <th style="padding:0 8px 10px;text-align:center;border-bottom:0.5pt solid #999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;">UN</th>
                  <th style="padding:0 8px 10px;text-align:right;border-bottom:0.5pt solid #999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;">QTD</th>
                  <th style="padding:0 8px 10px;text-align:right;border-bottom:0.5pt solid #999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;">VL. Unit</th>
                  <th style="padding:0 8px 10px;text-align:right;border-bottom:0.5pt solid #999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Total</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>
          </div>

          <div style="display:grid;grid-template-columns:1.15fr 0.85fr;gap:18px;margin-top:18px;align-items:start;">
            <div class="minimal-box">
              <div class="tinycaps">Fechamento</div>
              <div style="margin-top:12px;display:grid;gap:10px;font-size:13px;">
                <div style="display:flex;justify-content:space-between;gap:18px;">
                  <span class="muted">Metodo de pagamento</span>
                  <span style="font-weight:700;">${escapeHtml(detail.paymentMethodLabel || "-")}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:18px;">
                  <span class="muted">Tributos informativos</span>
                  <span style="font-size:12px;text-align:right;max-width:280px;">${escapeHtml(buildTransparencyText())}</span>
                </div>
                <div style="border-top:0.5pt solid #bdbdbd;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:18px;">
                  <div>
                    <div class="tinycaps">Total Geral</div>
                    <div class="muted" style="margin-top:4px;font-size:12px;">Documento do pedido.</div>
                  </div>
                  <div class="mono" style="font-size:26px;font-weight:800;line-height:1;">${escapeHtml(money(total))}</div>
                </div>
              </div>
            </div>
            <div class="minimal-box">
              <div class="tinycaps">Confianca</div>
              <div style="margin-top:12px;display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center;">
                <div style="display:flex;justify-content:center;">
                  <img src="${qrCodeDataUrl}" alt="QR Code do pedido" style="width:108px;height:108px;border:0.5pt solid #ddd;padding:6px;" />
                </div>
                <div style="font-size:12px;line-height:1.65;">
                  <div style="font-weight:700;">Obrigado pela preferencia.</div>
                  <div class="muted" style="margin-top:6px;">Escaneie para abrir a nota digital deste pedido.</div>
                  <div class="muted" style="margin-top:6px;">${escapeHtml(buildConservationText())}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export const printOrderDocument = async (detail: OrderDocumentDetail) => {
  const receiptWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=780");
  if (!receiptWindow) throw new Error("Nao foi possivel abrir o documento.");
  const html = await buildOrderDocumentHtml(detail);
  receiptWindow.document.write(html);
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
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;
  const total = detail.items.reduce((acc, item) => acc + Number(item.totalPrice || 0), 0);
  const { r, g, b } = hexToRgb(detail.branding.corPrimaria);
  const logoDataUrl = await loadRemoteDataUrl(detail.branding.logoUrl);
  const qrCodeDataUrl = await generateOrderQrDataUrl(detail);
  const companyMeta = buildCompanyMetaLines(detail);
  const clientLines = buildClientLines(detail);
  const deliveryLines = buildDeliveryLines(detail);
  const monoFont = "courier";
  let y = 34;

  const ensureSpace = (required = 20) => {
    if (y + required <= pageHeight - 42) return;
    doc.addPage();
    y = 34;
  };

  const drawLabelValueRow = (label: string, value: string, top: number, leftX: number, rightX: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(102, 102, 102);
    doc.text(label, leftX, top);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 17, 17);
    doc.text(value, rightX, top, { align: "right" });
  };

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1.2);
  doc.line(margin, y, right, y);
  y += 12;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, y + 2, 56, 56, undefined, "FAST");
    } catch {
      // noop
    }
  }

  const headerLeft = logoDataUrl ? margin + 70 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 17, 17);
  doc.text(detail.branding.nomeEmpresa || "Sabor Imperial", headerLeft, y + 18);
  doc.setFontSize(9);
  doc.setTextColor(98, 98, 98);
  doc.text("NOTA DO PEDIDO", headerLeft, y + 34);

  let metaY = y + 50;
  companyMeta.forEach((line) => {
    doc.text(line, headerLeft, metaY);
    metaY += 12;
  });

  doc.setFont(monoFont, "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 17, 17);
  doc.text(detail.orderCode, right, y + 18, { align: "right" });
  doc.setFont(monoFont, "normal");
  doc.setFontSize(10);
  doc.text(formatDateTime(detail.order?.data_pedido), right, y + 34, { align: "right" });

  y = Math.max(metaY, y + 56) + 12;
  doc.setDrawColor(204, 204, 204);
  doc.setLineWidth(0.5);
  doc.line(margin, y, right, y);
  y += 18;

  const boxGap = 14;
  const boxWidth = (contentWidth - boxGap) / 2;
  const drawInfoBox = (title: string, lines: string[], x: number, top: number) => {
    const lineHeight = 14;
    const boxHeight = Math.max(72, 26 + lines.length * lineHeight + 12);
    doc.setDrawColor(216, 216, 216);
    doc.roundedRect(x, top, boxWidth, boxHeight, 10, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(98, 98, 98);
    doc.text(title.toUpperCase(), x + 12, top + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    let lineY = top + 34;
    (lines.length ? lines : ["Dados indisponiveis."]).forEach((line) => {
      const wrapped = doc.splitTextToSize(line, boxWidth - 24);
      wrapped.forEach((part: string) => {
        doc.text(part, x + 12, lineY);
        lineY += 13;
      });
    });
    return boxHeight;
  };

  const clientBoxHeight = drawInfoBox("Cliente", clientLines, margin, y);
  const deliveryBoxHeight = drawInfoBox("Entrega", deliveryLines, margin + boxWidth + boxGap, y);
  y += Math.max(clientBoxHeight, deliveryBoxHeight) + 20;

  ensureSpace(120);
  const colX = {
    desc: margin,
    unit: margin + 280,
    qty: margin + 350,
    unitPrice: margin + 430,
    total: right,
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(88, 88, 88);
  doc.text("DESCRICAO", colX.desc, y);
  doc.text("UN", colX.unit, y, { align: "center" });
  doc.text("QTD", colX.qty, y, { align: "right" });
  doc.text("VL. UNIT", colX.unitPrice, y, { align: "right" });
  doc.text("TOTAL", colX.total, y, { align: "right" });
  y += 8;
  doc.setDrawColor(138, 138, 138);
  doc.line(margin, y, right, y);
  y += 16;

  detail.items.forEach((item) => {
    const subDetails = [item.cutType ? `Tipo de corte: ${item.cutType}` : null, item.notes ? `Obs.: ${item.notes}` : null]
      .filter(Boolean)
      .join(" • ");
    const descriptionLines = doc.splitTextToSize(item.name, 250);
    const subLines = subDetails ? doc.splitTextToSize(subDetails, 250) : [];
    const rowHeight = Math.max(18 + descriptionLines.length * 12 + subLines.length * 10, 28);

    ensureSpace(rowHeight + 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    let rowY = y;
    descriptionLines.forEach((line: string) => {
      doc.text(line, colX.desc, rowY);
      rowY += 12;
    });

    if (subLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      subLines.forEach((line: string) => {
        doc.text(line, colX.desc, rowY);
        rowY += 10;
      });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    doc.text(String(item.unit || "-"), colX.unit, y, { align: "center" });

    doc.setFont(monoFont, "normal");
    doc.text(Number(item.quantity || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 }), colX.qty, y, { align: "right" });
    doc.text(money(item.unitPrice), colX.unitPrice, y, { align: "right" });
    doc.setFont(monoFont, "bold");
    doc.text(money(item.totalPrice), colX.total, y, { align: "right" });

    y += rowHeight;
    doc.setDrawColor(218, 218, 218);
    doc.setLineWidth(0.5);
    doc.line(margin, y, right, y);
    y += 14;
  });

  ensureSpace(170);
  const summaryWidth = 280;
  const summaryX = right - summaryWidth;
  drawLabelValueRow("Metodo de pagamento", detail.paymentMethodLabel || "-", y, summaryX, right);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(98, 98, 98);
  const transparencyLines = doc.splitTextToSize(buildTransparencyText(), summaryWidth);
  transparencyLines.forEach((line: string) => {
    doc.text(line, summaryX, y);
    y += 11;
  });

  y += 4;
  doc.setDrawColor(160, 160, 160);
  doc.line(summaryX, y, right, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(98, 98, 98);
  doc.text("TOTAL GERAL", summaryX, y);
  doc.setFont(monoFont, "bold");
  doc.setFontSize(24);
  doc.setTextColor(17, 17, 17);
  doc.text(money(total), right, y + 2, { align: "right" });
  y += 24;

  ensureSpace(160);
  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, right, y);
  y += 18;

  try {
    doc.addImage(qrCodeDataUrl, "PNG", margin, y, 102, 102, undefined, "FAST");
  } catch {
    // noop
  }
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, 102, 102, 8, 8);

  const thanksX = margin + 124;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 17, 17);
  doc.text("Obrigado pela preferencia.", thanksX, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(92, 92, 92);
  const thanksLines = doc.splitTextToSize(`Escaneie para abrir a nota digital deste pedido.\n${buildConservationText()}`, contentWidth - 140);
  let thanksY = y + 34;
  thanksLines.forEach((line: string) => {
    doc.text(line, thanksX, thanksY);
    thanksY += 13;
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text("Documento do pedido.", margin, pageHeight - 18);

  doc.save(`${detail.orderCode.toLowerCase()}-nota-pedido.pdf`);
};
