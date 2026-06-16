const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CSV_PATH = path.join(__dirname, 'dados.csv');

// ---- CSV loading -----------------------------------------------------

function parseNumber(str) {
  if (str === undefined || str === null || str === '') return null;
  return parseFloat(str.replace(',', '.'));
}

function loadData() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const groups = new Map();
  let maxAnoMes = 0;

  // Parse header dynamically so added/reordered columns don't break the server
  const header = lines[0].replace(/^﻿/, '').split(';');
  const idx = {};
  header.forEach((col, i) => { idx[col.trim()] = i; });

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const grupo = cols[idx['Grupo']];
    const anoMes = parseInt(cols[idx['AnoMesContemplacao']], 10);
    const maiorLance = parseNumber(cols[idx['MaiorLance']]);
    const menorLance = parseNumber(cols[idx['MenorLance']]);
    const tipoBem = cols[idx['TipoBem']];
    const prazoGrupo = parseInt(cols[idx['PrazoGrupo']], 10);
    const prazoRestante = parseInt(cols[idx['PrazoRestante']], 10);

    if (anoMes > maxAnoMes) maxAnoMes = anoMes;

    if (!groups.has(grupo)) {
      groups.set(grupo, { grupo, tipoBem, prazoGrupo, prazoRestante, records: [] });
    }
    const group = groups.get(grupo);
    // keep static attributes from the most recent record
    if (group.records.length === 0 || anoMes > group.records[group.records.length - 1].anoMes) {
      group.tipoBem = tipoBem;
      group.prazoGrupo = prazoGrupo;
      group.prazoRestante = prazoRestante;
    }
    group.records.push({ anoMes, maiorLance, menorLance });
  }

  for (const group of groups.values()) {
    group.records.sort((a, b) => a.anoMes - b.anoMes);
  }

  return { groups, maxAnoMes };
}

let { groups, maxAnoMes } = loadData();

// ---- Helpers -----------------------------------------------------------

function prevMonth(anoMes) {
  const year = Math.floor(anoMes / 100);
  const month = anoMes % 100;
  return month === 1 ? (year - 1) * 100 + 12 : year * 100 + (month - 1);
}

function last12MonthsWindow(refAnoMes) {
  const months = [refAnoMes];
  let current = refAnoMes;
  for (let i = 0; i < 11; i++) {
    current = prevMonth(current);
    months.push(current);
  }
  return months;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---- Routes --------------------------------------------------------------

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/grupos', (req, res) => {
  const { prazoMin, prazoMax, tipo, lancePercentual } = req.body;

  const min = Number(prazoMin);
  const max = Number(prazoMax);
  const lance = Number(lancePercentual);
  const windowMonths = last12MonthsWindow(maxAnoMes);
  const windowSet = new Set(windowMonths);

  const candidates = [];

  for (const group of groups.values()) {
    if (group.tipoBem !== tipo) continue;
    if (group.prazoRestante < min || group.prazoRestante > max) continue;

    const recentRecords = group.records.filter((r) => windowSet.has(r.anoMes));
    if (recentRecords.length === 0) continue;

    const menorLanceValues = recentRecords.map((r) => r.menorLance);
    const maiorLanceValues = recentRecords.map((r) => r.maiorLance);
    const mediana = median(menorLanceValues);

    if (mediana === null) continue;

    candidates.push({
      grupo: group.grupo,
      maiorLance: Math.max(...maiorLanceValues),
      menorLance: Math.min(...menorLanceValues),
      prazoRestante: group.prazoRestante,
      mediana,
      atendeLance: mediana <= lance,
    });
  }

  candidates.sort((a, b) => a.mediana - b.mediana);

  const qualificados = candidates.filter((c) => c.atendeLance);
  const restantes = candidates.filter((c) => !c.atendeLance);
  const items = qualificados.concat(restantes).slice(0, 20);

  res.json({
    windowMonths,
    total: qualificados.length,
    items,
  });
});

app.get('/api/grupo/:grupo/historico', (req, res) => {
  const group = groups.get(req.params.grupo);
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const windowMonths = last12MonthsWindow(maxAnoMes);
  const windowSet = new Set(windowMonths);

  const historico = group.records
    .filter((r) => windowSet.has(r.anoMes))
    .map((r) => ({ anoMes: r.anoMes, menorLance: r.menorLance }))
    .sort((a, b) => a.anoMes - b.anoMes);

  res.json({ grupo: group.grupo, historico });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
