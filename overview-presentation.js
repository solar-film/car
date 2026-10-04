(function (root) {
    'use strict';

    const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const MODES = { daily: 'รายวัน', monthly: 'รายเดือน', yearly: 'รายปี' };
    const money = value => Math.round(value).toLocaleString('th-TH');
    const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // Rows already use the dashboard's active new/returning-customer filter.
    function buildSalesSeries(rows, mode = 'monthly', selectedMonth = '', now = new Date()) {
        if (!MODES[mode]) mode = 'monthly';
        const valid = rows.flatMap(row => {
            const date = row.date instanceof Date ? row.date : new Date(row.date);
            const price = Number(row.price);
            return row.date && Number.isFinite(date.getTime()) && Number.isFinite(price)
                ? [{ date, month: monthKey(date), price }] : [];
        });
        const selected = /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth) ? selectedMonth : '';
        const latest = valid.map(row => row.month).sort().at(-1) || monthKey(now);
        const effective = selected || latest;
        const year = Number(effective.slice(0, 4));
        const month = Number(effective.slice(5, 7));
        let keys = [];
        let labels = [];
        let fullLabels = [];
        let period = '';
        let eligible = valid;
        let keyOf;

        if (mode === 'daily') {
            const days = new Date(year, month, 0).getDate();
            keys = Array.from({ length: days }, (_, index) => `${effective}-${String(index + 1).padStart(2, '0')}`);
            labels = keys.map((_, index) => String(index + 1));
            fullLabels = labels.map(day => `${day} ${MONTHS[month - 1]} ${year + 543}`);
            period = `${MONTHS[month - 1]} ${year + 543}`;
            eligible = valid.filter(row => row.month === effective);
            keyOf = row => `${row.month}-${String(row.date.getDate()).padStart(2, '0')}`;
        } else if (mode === 'monthly') {
            if (selected) {
                keys = Array.from({ length: month }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
                eligible = valid.filter(row => row.month.slice(0, 4) === String(year) && row.month <= selected);
                period = `${MONTHS[0]} - ${MONTHS[month - 1]} ${year + 543}`;
            } else {
                const first = valid.map(row => row.month).sort()[0] || effective;
                const cursor = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1);
                while (monthKey(cursor) <= effective) {
                    keys.push(monthKey(cursor));
                    cursor.setMonth(cursor.getMonth() + 1);
                }
                period = 'ทุกเดือน';
            }
            fullLabels = keys.map(key => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543}`);
            labels = selected ? keys.map(key => MONTHS[Number(key.slice(5, 7)) - 1]) : fullLabels;
            keyOf = row => row.month;
        } else {
            eligible = selected ? valid.filter(row => row.month <= selected) : valid;
            const years = eligible.map(row => row.date.getFullYear());
            const first = years.length ? Math.min(...years) : year;
            const last = years.length ? Math.max(...years) : year;
            keys = Array.from({ length: last - first + 1 }, (_, index) => String(first + index));
            labels = keys.map(key => String(Number(key) + 543));
            fullLabels = labels.map(label => `ปี ${label}`);
            period = selected ? `ถึง ${MONTHS[month - 1]} ${year + 543}` : 'ทุกปี';
            keyOf = row => String(row.date.getFullYear());
        }

        const totals = new Map();
        eligible.forEach(row => totals.set(keyOf(row), (totals.get(keyOf(row)) || 0) + row.price));
        const values = keys.map(key => (totals.get(key) || 0) / 1.07);
        return { keys, labels, fullLabels, values, period, total: values.reduce((sum, value) => sum + value, 0), hasData: eligible.length > 0 };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { buildSalesSeries };
        return;
    }

    let chart;
    let chartRows = [];
    let selectedMonth = '';
    let chartMode = 'monthly';
    let frame;
    let rankingFocus;
    let rankingSource;
    const byId = id => document.getElementById(id);

    const lastValueLabel = {
        id: 'overviewLastValue',
        afterDatasetsDraw(instance) {
            const points = instance.getDatasetMeta(0).data;
            const point = points.at(-1);
            if (!point || !instance.width) return;
            const ctx = instance.ctx;
            const value = instance.data.datasets[0].data.at(-1);
            ctx.save();
            ctx.font = '500 12px Prompt, sans-serif';
            const label = money(value);
            const width = ctx.measureText(label).width + 18;
            const x = Math.max(2, Math.min(point.x - width / 2, instance.width - width - 2));
            const y = Math.max(2, point.y - 39);
            ctx.fillStyle = '#1688ff';
            ctx.beginPath();
            ctx.roundRect(x, y, width, 25, 5);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(point.x - 4, y + 25);
            ctx.lineTo(point.x, y + 30);
            ctx.lineTo(point.x + 4, y + 25);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + width / 2, y + 13);
            ctx.restore();
        }
    };

    function drawSalesChart() {
        const canvas = byId('salesTrendChart');
        if (!canvas) return;
        const series = buildSalesSeries(chartRows, chartMode, selectedMonth);
        byId('salesTrendTitle').innerHTML = `ยอดขาย${MODES[chartMode]} <small>(ถอด VAT 7%)</small>`;
        byId('salesTrendPeriod').textContent = series.period;
        byId('salesTrendTotal').textContent = `รวม ฿${money(series.total)}`;
        const status = byId('salesTrendStatus');
        status.textContent = !series.hasData ? 'ยังไม่มีข้อมูลยอดขายในช่วงนี้' : !root.Chart ? 'โหลดกราฟไม่สำเร็จ ดูยอดขายได้จากตารางรายวันด้านล่าง' : '';
        status.hidden = !status.textContent;
        canvas.setAttribute('aria-label', `ยอดขาย${MODES[chartMode]} ถอด VAT 7% ${series.period} รวม ${money(series.total)} บาท`);
        if (!root.Chart) return;

        const dataset = {
            label: 'ยอดขายถอด VAT 7%', data: series.values,
            borderColor: '#0877ff', backgroundColor: '#248cff24', borderWidth: 2,
            fill: true, tension: 0.15,
            pointRadius: context => context.dataIndex === series.values.length - 1 ? 5 : 3,
            pointHoverRadius: 6, pointBackgroundColor: '#0877ff', pointBorderWidth: 0
        };
        const options = {
            responsive: true, maintainAspectRatio: false,
            animation: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
            layout: { padding: { top: 30, right: 8, bottom: 0 } },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#174574', padding: 10, displayColors: false,
                    titleFont: { family: 'Prompt', size: 12 }, bodyFont: { family: 'Prompt', size: 12 },
                    callbacks: {
                        title: items => series.fullLabels[items[0]?.dataIndex] || '',
                        label: item => `฿${money(item.parsed.y)} (Ex VAT)`
                    }
                }
            },
            scales: {
                x: { grid: { color: '#edf3fb', drawTicks: false }, border: { color: '#e0eaf7' }, ticks: { color: '#6e89ae', maxRotation: 0, autoSkip: true, maxTicksLimit: 12, padding: 9, font: { family: 'Prompt', size: 10 } } },
                y: { beginAtZero: true, grace: '15%', grid: { color: '#eaf1fa', drawTicks: false }, border: { display: false }, ticks: { color: '#6e89ae', maxTicksLimit: 5, padding: 7, callback: value => money(value), font: { family: 'Prompt', size: 10 } } }
            }
        };
        if (chart) {
            chart.data = { labels: series.labels, datasets: [dataset] };
            chart.options = options;
            chart.update();
        } else {
            chart = new root.Chart(canvas, { type: 'line', data: { labels: series.labels, datasets: [dataset] }, options, plugins: [lastValueLabel] });
        }
    }

    function update({ rows, month }) {
        chartRows = rows;
        selectedMonth = month;
        root.cancelAnimationFrame(frame);
        frame = root.requestAnimationFrame(drawSalesChart);
        if (rankingSource && byId('overviewRankingDialog').open) {
            byId('overviewRankingList').innerHTML = byId(rankingSource).innerHTML;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-trend-mode]').forEach(button => {
            button.addEventListener('click', () => {
                chartMode = button.dataset.trendMode;
                document.querySelectorAll('[data-trend-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
                drawSalesChart();
            });
        });
        const dialog = byId('overviewRankingDialog');
        document.querySelectorAll('[data-rank-source]').forEach(button => {
            button.addEventListener('click', () => {
                rankingFocus = button;
                rankingSource = button.dataset.rankSource;
                byId('overviewRankingTitle').textContent = button.dataset.rankTitle;
                byId('overviewRankingList').innerHTML = byId(rankingSource).innerHTML;
                dialog.classList.toggle('rank-films', rankingSource === 'filmRanking');
                dialog.classList.toggle('rank-packages', rankingSource === 'installRanking');
                dialog.showModal();
                document.body.classList.add('overview-memo-open');
                byId('overviewRankingClose').focus();
            });
        });
        byId('overviewRankingClose').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => {
            document.body.classList.remove('overview-memo-open');
            rankingFocus?.focus();
        });
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
    });

    root.OverviewPresentation = { update };
})(typeof window !== 'undefined' ? window : globalThis);
