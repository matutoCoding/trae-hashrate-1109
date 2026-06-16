const BatchModule = {
    init() {
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('addBatchBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('closeAddBatch').addEventListener('click', () => this.closeAddModal());
        document.getElementById('cancelAddBatch').addEventListener('click', () => this.closeAddModal());
        document.getElementById('confirmAddBatch').addEventListener('click', () => this.handleAddBatch());
        document.getElementById('closeBatchDetail').addEventListener('click', () => this.closeDetailDrawer());
        document.querySelector('#batchDetailDrawer .drawer-mask').addEventListener('click', () => this.closeDetailDrawer());

        document.getElementById('batchSearch').addEventListener('input', Utils.debounce((e) => {
            this.render(e.target.value);
        }, 200));
    },

    render(keyword = '') {
        const list = document.getElementById('batchList');
        let batches = [...DataStore.data.vaccineBatches];

        if (keyword.trim()) {
            const kw = keyword.trim().toLowerCase();
            batches = batches.filter(b =>
                b.vaccineName.toLowerCase().includes(kw) ||
                b.batchNo.toLowerCase().includes(kw) ||
                (b.manufacturer || '').toLowerCase().includes(kw)
            );
        }

        if (batches.length === 0) {
            list.innerHTML = `
                <div class="empty-tip">
                    ${keyword ? '没有找到匹配的批次' : '暂无批次数据，点击右上角登记新批次'}
                </div>
            `;
            return;
        }

        list.innerHTML = batches.map(batch => this.renderBatchCard(batch)).join('');

        list.querySelectorAll('.batch-card').forEach(card => {
            card.addEventListener('click', () => {
                const batchId = card.dataset.batchId;
                this.showDetail(batchId);
            });
        });
    },

    renderBatchCard(batch) {
        const status = Utils.getBatchStatus(batch);
        const percent = Utils.getStockPercent(batch);
        const barClass = Utils.getStockBarClass(percent);
        const remaining = batch.availableQty || 0;
        const reserved = batch.reservedQty || 0;
        const frozen = batch.frozenQty || 0;

        let extraInfo = '';
        if (reserved > 0 || frozen > 0) {
            const parts = [];
            if (reserved > 0) parts.push(`预约占用${reserved}`);
            if (frozen > 0) parts.push(`召回冻结${frozen}`);
            extraInfo = `<div style="font-size: 11px; color: #fa8c16; margin-top: 2px;">（${parts.join(' / ')}）</div>`;
        }

        return `
            <div class="batch-card" data-batch-id="${batch.id}">
                <div class="batch-header">
                    <span class="batch-name">${Utils.escapeHtml(batch.vaccineName)}</span>
                    <span class="batch-status ${status.class}">${status.text}</span>
                </div>
                <div class="batch-no">批号：${Utils.escapeHtml(batch.batchNo)}</div>
                <div class="batch-info">
                    <div class="batch-info-item">
                        <span class="batch-info-label">厂家：</span>
                        <span>${Utils.escapeHtml(batch.manufacturer || '-')}</span>
                    </div>
                    <div class="batch-info-item">
                        <span class="batch-info-label">效期：</span>
                        <span>${Utils.escapeHtml(batch.expireDate)}</span>
                    </div>
                    <div class="batch-info-item">
                        <span class="batch-info-label">价格：</span>
                        <span>${batch.price ? '¥' + batch.price : '-'}</span>
                    </div>
                    <div class="batch-info-item">
                        <span class="batch-info-label">存储：</span>
                        <span>${Utils.escapeHtml(batch.storageCondition || '-')}</span>
                    </div>
                </div>
                <div class="batch-stock-bar">
                    <div class="stock-bar-header">
                        <span class="stock-bar-label">可用库存</span>
                        <span class="stock-bar-value">${remaining}/${batch.stockQty} 剂</span>
                    </div>
                    <div class="stock-bar">
                        <div class="stock-bar-fill ${barClass}" style="width: ${Math.min(percent, 100)}%"></div>
                    </div>
                    ${extraInfo}
                </div>
            </div>
        `;
    },

    openAddModal() {
        document.getElementById('addBatchModal').classList.add('active');
        document.getElementById('addBatchForm').reset();
    },

    closeAddModal() {
        document.getElementById('addBatchModal').classList.remove('active');
    },

    handleAddBatch() {
        const form = document.getElementById('addBatchForm');
        const vaccineName = form.vaccineName.value;
        const batchNo = form.batchNo.value.trim();
        const produceDate = form.produceDate.value;
        const expireDate = form.expireDate.value;
        const stockQty = parseInt(form.stockQty.value);

        if (!vaccineName) { Utils.showToast('请选择疫苗名称', 'error'); return; }
        if (!batchNo) { Utils.showToast('请输入批号', 'error'); return; }
        if (!produceDate) { Utils.showToast('请选择生产日期', 'error'); return; }
        if (!expireDate) { Utils.showToast('请选择有效期', 'error'); return; }
        if (!stockQty || stockQty <= 0) { Utils.showToast('请输入有效的入库数量', 'error'); return; }
        if (new Date(expireDate) <= new Date(produceDate)) {
            Utils.showToast('有效期必须晚于生产日期', 'error'); return;
        }

        const exists = DataStore.data.vaccineBatches.some(b => b.batchNo === batchNo);
        if (exists) {
            Utils.showToast('该批号已存在', 'error');
            return;
        }

        const batch = DataStore.addBatch({
            vaccineName,
            manufacturer: form.manufacturer.value.trim(),
            batchNo,
            produceDate,
            expireDate,
            stockQty,
            price: parseFloat(form.price.value) || null,
            storageCondition: form.storageCondition.value.trim(),
            remark: form.batchRemark.value.trim()
        });

        Utils.showToast('批次登记成功', 'success');
        this.closeAddModal();
        this.render();
        App.updateDashboardStats();
    },

    currentDetailBatchId: null,
    ledgerFilters: { type: '', startDate: '', endDate: '' },

    showDetail(batchId) {
        this.currentDetailBatchId = batchId;
        this.ledgerFilters = { type: '', startDate: '', endDate: '' };
        this.renderBatchDetail(batchId);
        document.getElementById('batchDetailDrawer').classList.add('active');
    },

    renderBatchDetail(batchId) {
        const batch = DataStore.getBatch(batchId);
        if (!batch) return;

        const status = Utils.getBatchStatus(batch);
        const records = DataStore.getRecordsByBatchId(batchId);
        const percent = Utils.getStockPercent(batch);
        const barClass = Utils.getStockBarClass(percent);
        const remaining = batch.availableQty || 0;
        const reserved = batch.reservedQty || 0;
        const frozen = batch.frozenQty || 0;
        const used = batch.usedQty || 0;
        const filters = this.ledgerFilters;
        const ledger = DataStore.getStockLedgerByBatch(batchId, filters);
        const ledgerSummary = DataStore.getStockLedgerSummary(batchId, filters);

        const typeOptions = Object.keys(DataStore.STOCK_LEDGER_TYPE_LABELS).map(k =>
            `<option value="${k}" ${filters.type === k ? 'selected' : ''}>${DataStore.STOCK_LEDGER_TYPE_LABELS[k]}</option>`
        ).join('');

        const content = document.getElementById('batchDetailContent');
        content.innerHTML = `
            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item full">
                        <div class="detail-label">疫苗名称</div>
                        <div class="detail-value">${Utils.escapeHtml(batch.vaccineName)}</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">批号</div>
                        <div class="detail-value" style="font-family: 'Courier New', monospace;">${Utils.escapeHtml(batch.batchNo)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">状态</div>
                        <div class="detail-value"><span class="batch-status ${status.class}">${status.text}</span></div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">生产厂家</div>
                        <div class="detail-value">${Utils.escapeHtml(batch.manufacturer || '-')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">生产日期</div>
                        <div class="detail-value">${Utils.escapeHtml(batch.produceDate)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">有效期至</div>
                        <div class="detail-value ${status.class.includes('expire') || status.class.includes('warning') ? 'highlight' : ''}">${Utils.escapeHtml(batch.expireDate)}</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">存储条件</div>
                        <div class="detail-value">${Utils.escapeHtml(batch.storageCondition || '-')}</div>
                    </div>
                    ${batch.remark ? `
                    <div class="detail-item full">
                        <div class="detail-label">备注</div>
                        <div class="detail-value">${Utils.escapeHtml(batch.remark)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">库存台账</div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">总入库量</div>
                        <div class="detail-value" style="color: #52c41a;">${batch.stockQty} 剂</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">已接种</div>
                        <div class="detail-value">${used} 剂</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">预约占用</div>
                        <div class="detail-value" style="color: #1677ff;">${reserved} 剂</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">召回冻结</div>
                        <div class="detail-value" style="color: #ff4d4f;">${frozen} 剂</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">当前可用</div>
                        <div class="detail-value" style="font-size: 18px; color: ${remaining < 10 ? '#ff4d4f' : '#52c41a'};">${remaining} 剂</div>
                    </div>
                    <div class="detail-item full">
                        <div style="margin-top: 8px;">
                            <div class="stock-bar" style="height: 8px;">
                                <div class="stock-bar-fill ${barClass}" style="width: ${Math.min(percent, 100)}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">库存变动流水（${ledger.length}条）</div>
                <div style="background:#f9fafb; border-radius:8px; padding:12px; margin-bottom:12px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                        <select class="form-input" id="ledgerTypeFilter" style="font-size:12px; height:32px;">
                            <option value="">全部类型</option>
                            ${typeOptions}
                        </select>
                        <button class="btn btn-outline" id="resetLedgerFilter" style="font-size:12px; height:32px; padding:0 12px;">重置筛选</button>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div>
                            <div style="font-size:11px; color:#999; margin-bottom:4px;">开始日期</div>
                            <input type="date" class="form-input" id="ledgerStartDate" value="${filters.startDate || ''}" style="font-size:12px; height:32px;">
                        </div>
                        <div>
                            <div style="font-size:11px; color:#999; margin-bottom:4px;">结束日期</div>
                            <input type="date" class="form-input" id="ledgerEndDate" value="${filters.endDate || ''}" style="font-size:12px; height:32px;">
                        </div>
                    </div>
                </div>

                <div class="ledger-stats" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; background:#f0f5ff; border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:#999;">期初余额</div>
                        <div style="font-size:15px; font-weight:600; color:#666;">${ledgerSummary.startBalance}剂</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:#999;">本期入库</div>
                        <div style="font-size:15px; font-weight:600; color:#52c41a;">+${ledgerSummary.totalIn}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:#999;">本期出库</div>
                        <div style="font-size:15px; font-weight:600; color:#ff4d4f;">-${ledgerSummary.totalOut}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:#999;">期末余额</div>
                        <div style="font-size:15px; font-weight:600; color:#1677ff;">${ledgerSummary.endBalance}剂</div>
                    </div>
                </div>

                ${ledger.length === 0 ? `
                    <div class="empty-tip" style="padding: 30px 20px;">暂无符合条件的流水记录</div>
                ` : `
                    <div class="detail-item-list">
                        ${ledger.map(l => {
                            const related = DataStore.getRelatedInfo(l.relatedId, l.relatedType);
                            let relatedHtml = '';
                            if (related) {
                                const colorMap = { appointment: '#1677ff', recall: '#ff4d4f', vaccination: '#52c41a' };
                                const color = colorMap[related.type] || '#666';
                                relatedHtml = `<div class="record-desc" style="color:${color}; cursor:pointer;" onclick="BatchModule.jumpToRelated('${related.type}', '${related.id}')">
                                    🔗 关联${related.label}：${Utils.escapeHtml(related.title)}
                                </div>`;
                            }
                            return `
                            <div class="record-item">
                                <div class="record-header">
                                    <span class="record-title">
                                        <span style="color: ${l.changeQty > 0 ? '#52c41a' : '#ff4d4f'}; font-weight: 600;">
                                            ${l.changeQty > 0 ? '+' : ''}${l.changeQty}
                                        </span>
                                        <span style="margin-left: 8px; font-weight: normal;">${l.typeLabel}</span>
                                    </span>
                                    <span style="font-size: 12px; color: #999;">
                                        余${l.afterQty}剂
                                    </span>
                                </div>
                                <div class="record-desc">${Utils.escapeHtml(l.remark)}</div>
                                ${relatedHtml}
                                <div class="record-desc">${Utils.formatDate(l.createdAt, 'YYYY-MM-DD HH:mm')}</div>
                            </div>
                        `}).join('')}
                    </div>
                `}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">接种记录（${records.length}条）</div>
                ${records.length === 0 ? `
                    <div class="empty-tip" style="padding: 30px 20px;">暂无接种记录</div>
                ` : `
                    <div class="detail-item-list">
                        ${records.slice(0, 20).map(r => {
                            const revacTag = r.isRevaccinate
                                ? '<span style="font-size:10px; padding:1px 6px; background:#fff7e6; color:#fa8c16; border-radius:3px; margin-left:4px;">召回补种</span>'
                                : '';
                            const revacLink = r.revaccinationRecordId
                                ? `<div class="record-desc" style="color:#52c41a;">🔗 已补种：批次${r.revaccinateBatchId ? DataStore.getBatch(r.revaccinateBatchId)?.batchNo : '-'}</div>`
                                : '';
                            return `
                            <div class="record-item">
                                <div class="record-header">
                                    <span class="record-title">
                                        ${Utils.getPetEmoji(r.petType)} ${Utils.escapeHtml(r.petName)}
                                        <span style="font-size: 11px; color: #999; font-weight: normal; margin-left: 6px;">
                                            ${Utils.escapeHtml(r.petType)}
                                        </span>
                                        ${revacTag}
                                    </span>
                                    <span class="appointment-tag ${r.status === 'done' ? 'status-completed' : 'status-cancelled'}">
                                        ${r.status === 'done' ? '正常' : '已召回'}
                                    </span>
                                </div>
                                <div class="record-desc">
                                    宠主：${Utils.escapeHtml(r.ownerName)} · ${Utils.maskPhone(r.ownerPhone)}
                                </div>
                                <div class="record-desc">
                                    接种时间：${r.vaccinationDate} ${r.vaccinationTime}
                                </div>
                                ${revacLink}
                            </div>
                        `}).join('')}
                        ${records.length > 20 ? `
                            <div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">
                                仅显示最近20条，请到"流向召回"模块查看完整记录
                            </div>
                        ` : ''}
                    </div>
                `}
            </div>

            ${batch.status !== 'recalled' && records.length > 0 ? `
                <div class="action-group">
                    <button class="btn btn-danger btn-block" onclick="App.navigateTo('page-recall'); setTimeout(() => BatchModule.prefillRecall('${batch.batchNo}'), 100);">
                        发起召回
                    </button>
                </div>
            ` : ''}
        `;

        const typeSel = document.getElementById('ledgerTypeFilter');
        if (typeSel) typeSel.onchange = (e) => { this.ledgerFilters.type = e.target.value; this.renderBatchDetail(batchId); };
        const startInp = document.getElementById('ledgerStartDate');
        if (startInp) startInp.onchange = (e) => { this.ledgerFilters.startDate = e.target.value; this.renderBatchDetail(batchId); };
        const endInp = document.getElementById('ledgerEndDate');
        if (endInp) endInp.onchange = (e) => { this.ledgerFilters.endDate = e.target.value; this.renderBatchDetail(batchId); };
        const resetBtn = document.getElementById('resetLedgerFilter');
        if (resetBtn) resetBtn.onclick = () => { this.ledgerFilters = { type: '', startDate: '', endDate: '' }; this.renderBatchDetail(batchId); };
    },

    jumpToRelated(type, id) {
        if (type === 'appointment') {
            App.navigateTo('page-schedule');
            Utils.showToast('请在排期页面查看该预约', 'info');
        } else if (type === 'recall') {
            App.navigateTo('page-recall');
            document.querySelector('.tab-item[data-tab="recall-notify"]').click();
            setTimeout(() => {
                const cards = document.querySelectorAll('.recall-card');
                for (const card of cards) {
                    if (card.dataset.recallId === id) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        card.style.boxShadow = '0 0 0 2px #1677ff';
                        setTimeout(() => card.style.boxShadow = '', 2000);
                        break;
                    }
                }
            }, 200);
            Utils.showToast('已跳转至召回管理', 'success');
        } else if (type === 'vaccination') {
            App.navigateTo('page-recall');
            Utils.showToast('请在流向召回模块查询该接种记录', 'info');
        }
    },

    closeDetailDrawer() {
        document.getElementById('batchDetailDrawer').classList.remove('active');
    },

    prefillRecall(batchNo) {
        document.querySelector(`.tab-item[data-tab="recall-notify"]`).click();
        setTimeout(() => {
            document.getElementById('createRecallBtn').click();
            const select = document.getElementById('recallBatchNo');
            if (select) select.value = batchNo;
        }, 150);
    }
};