// DEMO ONLY — generates synthetic report documents (progress report, receipt, invoice, contract)
// for the matched DSP, with controlled defects. Used because no real step-8 reports exist yet
// (the ToR anticipates this: "controlled test cases + live-validation gate").

function addDaysDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function simulateOutOfScopeSteps(c) {
  // Steps 5 (agreement), 6 (first disbursement) and 7 (implementation) are OUT OF SCOPE.
  // We only record the dates/amounts the validators need, clearly marked as simulated.
  const start = c.approved_dtp.timeline_start || '2027-04-01';
  const approved = c.approved_dtp.approved_amount;
  const first = Math.round(approved * 0.5);
  return {
    agreement_signed: addDaysDate(start, -14),
    first: { amount: first, date: addDaysDate(start, -7) },
    second: { amount: approved - first, date: null },
    report_1_date: addDaysDate(start, 70),
    final_report_date: c.approved_dtp.timeline_end || addDaysDate(start, 180),
    simulated: true,
  };
}

export function generateFirstReport(c, variant) {
  const biz = c.msme.business_name;
  const dsp = c.match.dsp_name;
  const contractValue = c.match.quote_total;
  const tranche = c.disbursements.first.amount;
  const reportDate = c.disbursements.report_1_date;
  let payee = dsp;
  let paid = tranche;
  let invoiceAmount = tranche;
  let invoiceNo = `INV-${String(1000 + (c.case_id.length * 37) % 900)}`;
  if (variant === 'payee_mismatch') payee = 'Web Solutions Belize Ltd.';
  if (variant === 'amount_mismatch') paid = Math.round(tranche * 0.79);
  if (variant === 'duplicate_invoice') invoiceNo = 'INV-2207';
  const objectives = c.approved_dtp.objectives || [];
  const milestoneLines = objectives.map((o) => {
    const due = o.date && o.date <= reportDate;
    if (due) {
      const missing = variant === 'missing_evidence';
      return `Milestone ${o.id} — ${o.text} | Status: ${missing ? 'in_progress' : 'completed'} | Evidence: ${missing ? 'none' : `attendance sheet and photos (${o.target})`}`;
    }
    return `Milestone ${o.id} — ${o.text} | Status: in_progress | Evidence: progress screenshots uploaded`;
  });
  return [
    { type: 'progress_report', name: 'First_Progress_Report.pdf', text: `[Page 1]\nFIRST PROGRESS REPORT\nBusiness: ${biz}\nReport date: ${reportDate}\nProvider engaged: ${dsp}\n[Page 2]\n${milestoneLines.join('\n')}\n` },
    { type: 'payment_receipt', name: 'Bank_Transfer_Receipt.pdf', text: `[Page 1]\nBANK TRANSFER RECEIPT\nPayer: ${biz}\nPayee: ${payee}\nAmount transferred: BZD ${paid.toLocaleString('en-US')}\nTransfer date: ${addDaysDate(c.disbursements.agreement_signed, 10)}\nReference: TRX-${88000 + paid}\n` },
    { type: 'invoice', name: `Invoice_${invoiceNo}.pdf`, text: `[Page 1]\nINVOICE\nIssued by: ${dsp}\nBill to: ${biz}\nInvoice number: ${invoiceNo}\nInvoice date: ${addDaysDate(c.disbursements.agreement_signed, 8)}\nAmount due: BZD ${invoiceAmount.toLocaleString('en-US')}\n` },
    { type: 'contract', name: 'Service_Contract.pdf', text: `[Page 1]\nSERVICE CONTRACT\nClient: ${biz}\nProvider: ${dsp}\nContract value: BZD ${Number(contractValue).toLocaleString('en-US')}\nSigned on: ${addDaysDate(c.disbursements.agreement_signed, 2)}\n` },
  ];
}

export function generateFinalReport(c, variant) {
  const biz = c.msme.business_name;
  const dsp = c.match.dsp_name;
  const remaining = c.approved_dtp.approved_amount - c.disbursements.first.amount;
  const paid = variant === 'payment_gap' ? Math.round(remaining * 0.6) : remaining;
  const objectives = c.approved_dtp.objectives || [];
  const lines = objectives.map((o) => `Milestone ${o.id} — ${o.text} | Status: completed | Evidence: final results (${o.target}) with screenshots and records`);
  return [
    { type: 'progress_report', name: 'Final_Report.pdf', text: `[Page 1]\nFINAL REPORT\nBusiness: ${biz}\nReport date: ${c.disbursements.final_report_date}\n[Page 2]\n${lines.join('\n')}\n` },
    { type: 'payment_receipt', name: 'Final_Transfer_Receipt.pdf', text: `[Page 1]\nBANK TRANSFER RECEIPT\nPayer: ${biz}\nPayee: ${dsp}\nAmount transferred: BZD ${paid.toLocaleString('en-US')}\nTransfer date: ${c.disbursements.final_report_date}\nReference: TRX-${99000 + paid}\n` },
  ];
}
