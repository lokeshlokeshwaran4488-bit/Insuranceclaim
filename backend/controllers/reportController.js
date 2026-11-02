const {
  getReportSummary,
  generateClaimsCsv,
  generateSettlementsCsv
} = require('../services/reportService');

async function getSummary(req, res, next) {
  try {
    const { from_date, to_date } = req.query;
    const summary = await getReportSummary(from_date, to_date);
    return res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function exportClaimsCsv(req, res, next) {
  try {
    const csvData = await generateClaimsCsv(req.query);
    const filename = `claims_report_${new Date().toISOString().replace(/[:.]/g, '')}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvData);
  } catch (err) {
    next(err);
  }
}

async function exportSettlementsCsv(req, res, next) {
  try {
    const csvData = await generateSettlementsCsv(req.query.payment_status);
    const filename = `settlements_report_${new Date().toISOString().replace(/[:.]/g, '')}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvData);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  exportClaimsCsv,
  exportSettlementsCsv
};

