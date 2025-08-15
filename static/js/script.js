document.addEventListener('DOMContentLoaded', () => {
  //–– AUTH & NAVBAR SETUP ––
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = 'sign_in.html';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const navUsername = document.getElementById('nav-username');
  const navEmail = document.getElementById('nav-email');
  document.getElementById('logoutBtn')
    .addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = 'sign_in.html';
    });

  fetch('/api/auth/me', { headers })
    .then(r => r.json())
    .then(user => {
      navUsername.textContent = user.name;
      navEmail.textContent = user.email;
    })
    .catch(() => window.location.href = 'sign_in.html');

  //–– ELEMENT REFERENCES & STATE ––
  let activePeriod = 'day';
  let activeType   = 'expense';
  let activeSide   = 'expense';

  const summaryCards      = document.querySelectorAll('.summary-card');
  const mainTabs          = document.querySelectorAll('.tabs .tab');
  const sideTabs          = document.querySelectorAll('.side-tabs .tab');
  const dateSelect        = document.getElementById('date-select');
  const monthSelect       = document.getElementById('month-select');
  const yearSelect        = document.getElementById('year-select');
  const tagSelectExpense  = document.getElementById('tag-select-expense');
  const tagSelectIncome   = document.getElementById('tag-select-income');
  const expenseList       = document.getElementById('expense-list');
  const incomeList        = document.getElementById('income-list');

  const sideMonth         = document.getElementById('side-month');
  const sideDate          = document.getElementById('side-date');
  const sideBalance       = document.getElementById('side-balance');
  const gainAmount        = document.getElementById('gain-amount');
  const lossAmount        = document.getElementById('loss-amount');

  const sideExpenseSection = document.getElementById('side-expense-list');
  const sideIncomeSection  = document.getElementById('side-income-list');
  const sideAddBtns        = document.querySelectorAll('.side-add-btn');
  const sideForms = {
    expense: document.getElementById('side-expense-form'),
    income:  document.getElementById('side-income-form')
  };

  //–– UI TOGGLES ––
  function toggleSummaryPeriod(period) {
    summaryCards.forEach(c => c.classList.toggle('active', c.dataset.period === period));
  }

  function toggleMainType(type) {
    mainTabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));
    expenseList.style.display = type === 'expense' ? '' : 'none';
    incomeList.style.display  = type === 'income'  ? '' : 'none';
    tagSelectExpense.style.display = type === 'expense' ? '' : 'none';
    tagSelectIncome.style.display  = type === 'income'  ? '' : 'none';
  }

  function toggleSideType(type) {
    sideTabs.forEach(t => t.classList.toggle('active', t.dataset.side === type));
    sideExpenseSection.style.display = type === 'expense' ? '' : 'none';
    sideIncomeSection.style.display  = type === 'income'  ? '' : 'none';
  }

  //–– FETCH & RENDER ––
  function getFilters() {
    return {
      period:    activePeriod,
      dateRange: dateSelect.value,
      month:     monthSelect.value,
      year:      yearSelect.value,
      tag:       activeType === 'expense' ? tagSelectExpense.value : tagSelectIncome.value,
      type:      activeType
    };
  }

  function loadTransactions() {
    const params = new URLSearchParams(getFilters());
    fetch(`/api/transactions?${params}`, { headers })
      .then(r => r.json())
      .then(data => {
        // summary cards
        document.getElementById('amount-day').textContent   = data.summary.day.toFixed(2);
        document.getElementById('amount-month').textContent = data.summary.month.toFixed(2);
        document.getElementById('amount-year').textContent  = data.summary.year.toFixed(2);

        // main list
        const listEl = activeType === 'expense' ? expenseList : incomeList;
        listEl.innerHTML = '';
        if (!data.items.length) {
          listEl.innerHTML = `<p class="muted">No ${activeType} found.</p>`;
        } else {
          data.items.forEach(tx => {
            const div = document.createElement('div');
            div.className = activeType === 'expense' ? 'expense-item' : 'income-item';
            div.innerHTML = `<div>${tx.tag}</div><div class="amount">${tx.amount.toFixed(2)}</div>`;
            listEl.appendChild(div);
          });
        }

        // side panel
        sideMonth.textContent   = data.side.month;
        sideDate.textContent    = data.side.dateRange;
        sideBalance.textContent = data.side.balance.toFixed(2);
        gainAmount.textContent  = data.side.gain.toFixed(2);
        lossAmount.textContent  = data.side.loss.toFixed(2);

        sideExpenseItems.innerHTML = '';
        sideIncomeItems.innerHTML  = '';
        data.side.items.forEach(tx => {
          const el = document.createElement('div');
          el.className = `side-${tx.type}-item`;
          el.innerHTML = `<span>${tx.tag}</span><span class="amount">${tx.amount.toFixed(2)}</span>`;
          if (tx.type === 'expense') sideExpenseItems.appendChild(el);
          else sideIncomeItems.appendChild(el);
        });
      })
      .catch(console.error);
  }

  //–– EVENT LISTENERS ––
  summaryCards.forEach(card =>
    card.addEventListener('click', () => {
      activePeriod = card.dataset.period;
      toggleSummaryPeriod(activePeriod);
      loadTransactions();
    })
  );

  mainTabs.forEach(tab =>
    tab.addEventListener('click', () => {
      activeType = tab.dataset.type;
      toggleMainType(activeType);
      loadTransactions();
    })
  );

  [dateSelect, monthSelect, yearSelect, tagSelectExpense, tagSelectIncome]
    .forEach(el => el.addEventListener('change', loadTransactions));

  sideTabs.forEach(tab =>
    tab.addEventListener('click', () => {
      activeSide = tab.dataset.side;
      toggleSideType(activeSide);
    })
  );

  sideAddBtns.forEach(btn =>
    btn.addEventListener('click', () => {
      const type = btn.dataset.form;
      sideForms[type].style.display = '';
      btn.style.display = 'none';
    })
  );

  document.querySelectorAll('.side-cancel-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const form = btn.closest('.side-form-inner');
      const type = form.id.split('-')[1];
      form.style.display = 'none';
      document.querySelector(`.side-add-btn[data-form="${type}"]`).style.display = '';
    })
  );

  Object.entries(sideForms).forEach(([type, form]) => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        type,
        tag:         fd.get('tag'),
        amount:      parseFloat(fd.get('amount')),
        description: fd.get('description')
      };
      fetch('/api/transactions', {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(() => {
        form.reset();
        form.style.display = 'none';
        document.querySelector(`.side-add-btn[data-form="${type}"]`).style.display = '';
        loadTransactions();
      })
      .catch(console.error);
    });
  });

  //–– INITIALIZE –– 
  toggleSummaryPeriod(activePeriod);
  toggleMainType(activeType);
  toggleSideType(activeSide);
  loadTransactions();
});

// -- Load Transactions --
function loadTransactions() {
    const params = new URLSearchParams(getFilters());
    fetch(`/api/transactions?${params}`, { headers })
      .then(r => r.json())
      .then(data => {
        const listEl = activeType === 'expense' ? expenseList : incomeList;
        listEl.innerHTML = '';
        if (!data.items.length) {
          listEl.innerHTML = `<p class="muted">No ${activeType} found.</p>`;
        } else {
          data.items.forEach(tx => {
            const div = document.createElement('div');
            div.className = activeType === 'expense' ? 'expense-item' : 'income-item';
            div.innerHTML = `<div>${tx.tag}</div><div class="amount">${tx.amount.toFixed(2)}</div>`;
            listEl.appendChild(div);
          });
        }
      })
      .catch(console.error);
}

document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/transactions')
        .then(response => response.json())
        .then(data => {
            const list = document.getElementById('transaction-list');
            list.innerHTML = ''; 

            if (data.length === 0) {
                list.innerHTML = '<li>ไม่มีข้อมูล</li>';
                return;
            }

            data.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.date} | ${item.type} | ${item.tag} | ${item.amount} บาท | ${item.description}`;
                list.appendChild(li);
            });
        })
        .catch(error => {
            console.error('Error loading transactions:', error);
        });
});