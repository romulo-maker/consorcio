const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatPercent(value) {
  return `${value.toFixed(2).replace('.', ',')}%`;
}

function formatAnoMes(anoMes) {
  const ano = Math.floor(anoMes / 100);
  const mes = anoMes % 100;
  return `${MESES[mes - 1]}/${ano}`;
}

function populatePrazoSelects() {
  const min = document.getElementById('prazoMin');
  const max = document.getElementById('prazoMax');
  for (let p = 30; p <= 180; p++) {
    min.appendChild(new Option(p, p));
    max.appendChild(new Option(p, p));
  }
  min.value = 30;
  max.value = 180;
}

let chart = null;
let currentItems = [];
let selectedGrupo = null;
const sortState = { key: null, dir: 1 };

function renderGrid(items) {
  currentItems = items;
  const tbody = document.getElementById('grid-body');
  tbody.innerHTML = '';

  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.dataset.grupo = item.grupo;
    if (!item.atendeLance) tr.classList.add('fora-do-lance');
    if (item.grupo === selectedGrupo) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${item.grupo}</td>
      <td>${formatPercent(item.maiorLance)}</td>
      <td>${formatPercent(item.menorLance)}</td>
      <td>${item.prazoRestante}</td>
      <td>${formatPercent(item.mediana)}</td>
    `;
    tr.addEventListener('click', () => selectGrupo(tr, item.grupo));
    tbody.appendChild(tr);
  });

  document.getElementById('grid').classList.toggle('hidden', items.length === 0);
}

function sortBy(key) {
  if (sortState.key === key) {
    sortState.dir *= -1;
  } else {
    sortState.key = key;
    sortState.dir = 1;
  }

  const sorted = [...currentItems].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return cmp * sortState.dir;
  });

  document.querySelectorAll('#grid thead th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.key === key) {
      th.classList.add(sortState.dir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });

  renderGrid(sorted);
}

document.querySelectorAll('#grid thead th').forEach((th) => {
  th.addEventListener('click', () => sortBy(th.dataset.key));
});

async function selectGrupo(tr, grupo) {
  selectedGrupo = grupo;
  document.querySelectorAll('#grid-body tr').forEach((row) => row.classList.remove('selected'));
  tr.classList.add('selected');

  const res = await fetch(`/api/grupo/${grupo}/historico`);
  const data = await res.json();

  const labels = data.historico.map((h) => formatAnoMes(h.anoMes));
  const valores = data.historico.map((h) => h.menorLance);
  const lancePercentual = Number(document.getElementById('lancePercentual').value);
  const linhaLance = labels.map(() => lancePercentual);

  const container = document.getElementById('chart-container');
  container.classList.remove('hidden');
  document.getElementById('chart-title').textContent = `Histórico do Menor Lance - Grupo ${grupo}`;

  const ctx = document.getElementById('chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Menor Lance (%)',
          data: valores,
          borderColor: '#2f6fed',
          backgroundColor: 'rgba(47, 111, 237, 0.15)',
          tension: 0.2,
          fill: true,
        },
        {
          label: `Lance informado (${formatPercent(lancePercentual)})`,
          data: linhaLance,
          borderColor: '#e53935',
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: '%' } },
      },
    },
  });

  container.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('filtro-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const prazoMin = document.getElementById('prazoMin').value;
  const prazoMax = document.getElementById('prazoMax').value;
  const tipo = document.getElementById('tipo').value;
  const lancePercentual = document.getElementById('lancePercentual').value;

  const status = document.getElementById('status');
  status.textContent = 'Buscando...';
  document.getElementById('chart-container').classList.add('hidden');

  if (Number(prazoMin) > Number(prazoMax)) {
    status.textContent = 'O prazo mínimo não pode ser maior que o prazo máximo.';
    document.getElementById('grid').classList.add('hidden');
    return;
  }

  const res = await fetch('/api/grupos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prazoMin, prazoMax, tipo, lancePercentual }),
  });
  const data = await res.json();

  if (data.items.length === 0) {
    status.textContent = 'Nenhum grupo encontrado com os filtros informados.';
    document.getElementById('grid').classList.add('hidden');
    return;
  }

  selectedGrupo = null;
  sortState.key = null;
  sortState.dir = 1;
  document.querySelectorAll('#grid thead th').forEach((th) => th.classList.remove('sort-asc', 'sort-desc'));

  if (data.total >= data.items.length) {
    status.textContent = `${data.items.length} grupo(s) atendem ao percentual de lance informado.`;
  } else {
    status.textContent = `${data.total} grupo(s) atendem ao percentual informado. Completando a lista até ${data.items.length} com os próximos melhores (destacados em amarelo).`;
  }
  renderGrid(data.items);
});

document.getElementById('btn-print').addEventListener('click', () => {
  window.print();
});

populatePrazoSelects();
