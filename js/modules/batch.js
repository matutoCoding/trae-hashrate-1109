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

    showDetail(batchId) {
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
        const ledger = DataStore.getStockLedgerByBatch(batchId);

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
                ${ledger.length === 0 ? `
                    <div class="empty-tip" style="padding: 30px 20px;">暂无流水记录</div>
                ` : `
                    <div class="detail-item-list">
                        ${ledger.map(l => `
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
                                <div class="record-desc">${Utils.formatDate(l.createdAt, 'YYYY-MM-DD HH:mm')}</div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">接种记录（${records.length}条）</div>
                ${records.length === 0 ? `
                    <div class="empty-tip" style="padding: 30px 20px;">暂无接种记录</div>
                ` : `
                    <div class="detail-item-list">
                        ${records.slice(0, 20).map(r => `
                            <div class="record-item">
                                <div class="record-header">
                                    <span class="record-title">
                                        ${Utils.getPetEmoji(r.petType)} ${Utils.escapeHtml(r.petName)}
                                        <span style="font-size: 11px; color: #999; font-weight: normal; margin-left: 6px;">
                                            ${Utils.escapeHtml(r.petType)}
                                        </span>
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
                            </div>
                        `).join('')}
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

        document.getElementById('batchDetailDrawer').classList.add('active');
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