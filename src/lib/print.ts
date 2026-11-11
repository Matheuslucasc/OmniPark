import type { PrintSettings, PaperSize, Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatTicket } from '@/lib/parking-utils';

const paperCss: Record<PaperSize, string> = {
  a4:         '@page { size: A4; margin: 15mm; }',
  thermal80:  '@page { size: 80mm auto; margin: 3mm; }',
  thermal58:  '@page { size: 58mm auto; margin: 2mm; }',
};

const paperWidth: Record<PaperSize, string> = {
  a4:        '190mm',
  thermal80: '72mm',
  thermal58: '52mm',
};

export function printHtml(html: string, printSettings: PrintSettings): void {
  const { paperSize, fontSize } = printSettings;

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    ${paperCss[paperSize]}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize}pt;
      width: ${paperWidth[paperSize]};
      color: #000;
      background: #fff;
    }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .large   { font-size: ${fontSize + 4}pt; }
    .xlarge  { font-size: ${fontSize + 10}pt; letter-spacing: 4px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .row     { display: flex; justify-content: space-between; margin: 3px 0; }
    .small   { font-size: ${Math.max(fontSize - 2, 8)}pt; color: #555; }
    .total   { font-size: ${fontSize + 6}pt; font-weight: bold; text-align: center;
               margin: 8px 0; padding: 6px; background: #000; color: #fff; }
    /* Nome/modelo do veículo em destaque (logo abaixo da placa) */
    .vehicle { font-size: ${fontSize + 6}pt; font-weight: bold; text-align: center;
               text-transform: uppercase; border: 2px solid #000; border-radius: 4px;
               padding: 4px 6px; margin: 6px 0 2px; word-break: break-word; }
    /* Vários tickets num só trabalho de impressão: um por página (corte) */
    .ticket-break { break-after: page; page-break-after: always; }
  </style>
</head>
<body>${html}</body>
</html>`;

  // Usa iframe invisível para não abrir nova aba.
  // IMPORTANTE: o iframe precisa ter a LARGURA REAL do papel. Se ficar com 1px,
  // o Chrome renderiza o conteúdo espremido e a impressora recebe um job em
  // branco (o papel é cortado mas nada é escrito). Mantemos visualmente oculto
  // jogando para fora da tela, mas com largura/altura reais.
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:80mm;height:200mm;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }

  doc.open();
  doc.write(fullHtml);
  doc.close();

  const win = iframe.contentWindow;
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* já removido */ } }, 500);
  };

  const doprint = () => {
    // Espera o layout/fontes estabilizarem antes de imprimir, senão o job
    // pode sair em branco.
    win?.requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          win.onafterprint = cleanup;
          win.focus();
          win.print();
        } finally {
          // Fallback caso onafterprint não dispare (alguns drivers/navegadores)
          setTimeout(cleanup, 3000);
        }
      }, 150);
    });
  };

  if (doc.readyState === 'complete') {
    doprint();
  } else {
    iframe.onload = doprint;
  }
}

// ── Templates de ticket ───────────────────────────────────────────────────────

/** Escapa texto digitado pelo operador antes de colocar no HTML do ticket. */
function esc(v: string | undefined): string {
  return (v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export interface EntryTicketData {
  plate: string;
  vehicleName?: string;
  entryTime: string;
  id: string;
  ticketNumber?: string; // nº diário formatado (ex.: "001")
  parkingName: string;
  parkingAddress?: string;
  parkingPhone?: string;
  ticketObservation?: string;
  /** Quando definido (modo valor fixo), imprime o valor a pagar na saída. */
  fixedPrice?: number;
}

export interface ExitReceiptData extends EntryTicketData {
  exitTime: string;
  duration: string;
  amountPaid: number;
}

export function buildEntryTicketHtml(d: EntryTicketData): string {
  return `
    <div class="center bold large">${esc(d.parkingName)}</div>
    ${d.parkingAddress ? `<div class="center small">${esc(d.parkingAddress)}</div>` : ''}
    ${d.parkingPhone   ? `<div class="center small">Tel: ${esc(d.parkingPhone)}</div>` : ''}
    <div class="center small">TICKET DE ENTRADA</div>
    ${d.ticketNumber ? `<div class="center large bold">Nº ${d.ticketNumber}</div>` : ''}
    <div class="divider"></div>
    <div class="center xlarge bold">${d.plate}</div>
    ${d.vehicleName ? `<div class="vehicle">${esc(d.vehicleName)}</div>` : ''}
    <div class="divider"></div>
    <div class="row"><span>Entrada:</span><span class="bold">${d.entryTime}</span></div>
    ${d.fixedPrice != null ? `<div class="row"><span>Valor (fixo):</span><span class="bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.fixedPrice)}</span></div><div class="center small">Pagamento na saída</div>` : ''}
    ${d.ticketObservation ? `<div class="divider"></div><div class="center small">${esc(d.ticketObservation)}</div>` : ''}
    <div class="divider"></div>
    <div class="center small">Guarde este ticket</div>
    ${d.ticketNumber ? `<div class="center small">Ticket Nº ${d.ticketNumber}</div>` : ''}
    <div class="center small">ID: ${d.id.slice(0, 8)}</div>
  `;
}

export function buildExitReceiptHtml(d: ExitReceiptData): string {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.amountPaid);
  return `
    <div class="center bold large">${esc(d.parkingName)}</div>
    ${d.parkingAddress ? `<div class="center small">${esc(d.parkingAddress)}</div>` : ''}
    ${d.parkingPhone   ? `<div class="center small">Tel: ${esc(d.parkingPhone)}</div>` : ''}
    <div class="center small">COMPROVANTE DE SAÍDA</div>
    ${d.ticketNumber ? `<div class="center large bold">Nº ${d.ticketNumber}</div>` : ''}
    <div class="divider"></div>
    <div class="center xlarge bold">${d.plate}</div>
    ${d.vehicleName ? `<div class="vehicle">${esc(d.vehicleName)}</div>` : ''}
    <div class="divider"></div>
    <div class="row"><span>Entrada:</span><span class="bold">${d.entryTime}</span></div>
    <div class="row"><span>Saída:</span><span class="bold">${d.exitTime}</span></div>
    <div class="row"><span>Permanência:</span><span class="bold">${d.duration}</span></div>
    <div class="total">TOTAL: ${brl}</div>
    ${d.ticketObservation ? `<div class="divider"></div><div class="center small">${esc(d.ticketObservation)}</div>` : ''}
    <div class="divider"></div>
    <div class="center small">Obrigado pela preferência!</div>
  `;
}

function entryTicketFor(v: Vehicle, s: ParkingSettings): string {
  return buildEntryTicketHtml({
    plate:             v.plate,
    vehicleName:       v.vehicleName,
    entryTime:         formatDateTime(v.entryTime),
    id:                v.id,
    ticketNumber:      formatTicket(v.dailyTicket),
    parkingName:       s.parkingName,
    parkingAddress:    s.parkingAddress,
    parkingPhone:      s.parkingPhone,
    ticketObservation: s.ticketObservation,
    fixedPrice:        s.pricing.chargeMode === 'fixed' ? s.pricing.fixedPrice : undefined,
  });
}

/** Imprime (ou reimprime) o ticket de entrada de um veículo — usado em qualquer aparelho. */
export function printEntryTicket(v: Vehicle, s: ParkingSettings): void {
  printEntryTickets([v], s);
}

/**
 * Imprime vários tickets de entrada num único trabalho (uma janela de impressão),
 * um por página — na térmica, o driver corta entre eles.
 */
export function printEntryTickets(vs: Vehicle[], s: ParkingSettings): void {
  if (vs.length === 0) return;
  const html = vs
    .map((v, i) => (i < vs.length - 1 ? `<div class="ticket-break">${entryTicketFor(v, s)}</div>` : entryTicketFor(v, s)))
    .join('');
  printHtml(html, s.print);
}
