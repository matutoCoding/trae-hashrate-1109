const RecallModule = {
    currentSearchBatchNo: '',

    init() {
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.querySelectorAll('#page-recall .tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#page-recall .tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.querySelectorAll('#page-recall .tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById('tab-' + target).classList.add('active');
            });
        });

        document.getElementById('traceSearchBtn').addEventListener('click', () => {
            this.doTrace();
        });
        document.getElementById('traceSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.doTrace();
        });

        document.getElementById('createRecallBtn').addEventListener('click', () => this.openCreateModal());
        document.getElementById('closeCreateRecall').addEventListener('click', () => this.closeCreateModal());
        document.getElementById('cancelCreateRecall').addEventListener('click', () => this.closeCreateModal());
        document.getElementById('confirmCreateRecall').addEventListener('click', () => this.handleCreateRecall());

        document.getElementById('closeRecallDetail').addEventListener('click', () => this.closeDetailDrawer());
        document.querySelector('#recallDetailDrawer .drawer-mask').addEventListener('click', () => this.closeDetailDrawer());
    },

    render() {
        this.renderRecallList();
        this.populateBatchSelect();
    },

    doTrace() {
        const input = document.getElementById('traceSearch');
        const batchNo = input.value.trim();
        if (!batchNo) {
            Utils.showToast('请输入批号', 'warning');
            return;
        }
        this.currentSearchBatchNo = batchNo;
        this.renderTraceResult(batchNo);
    },

    renderTraceResult(batchNo) {
        const container = document.getElementById('traceResult');
        const records = DataStore.getRecordsByBatch(batchNo);
        const batch = DataStore.data.vaccineBatches.find(b => b.batchNo === batchNo);

        if (!batch && records.length === 0) {
            container.innerHTML = `
                <div class="empty-tip">
                    未找到批号 <b style="color:#ff4d4f;">${Utils.escapeHtml(batchNo)}</b> 的相关记录
                    <div style="margin-top: 12px; font-size: 12px; color: #999;">请确认批号是否正确</div>
                </div>
            `;
            return;
        }

        const doneCount = records.filter(r => r.status === 'done').length;
        const recalledCount = records.filter(r => r.status === 'recalled').length;
        const batchStatus = batch ? Utils.getBatchStatus(batch) : { text: '未知', class: 'status-recalled' };

        let recallInfo = '';
        const existingRecall = DataStore.data.recallRecords.find(r => r.batchNo === batchNo);
        if (existingRecall) {
            recallInfo = `
                <div class="recall-summary">
                    <div style="font-weight: 600; color: #ff4d4f; margin-bottom: 6px;">⚠️ 该批次已发起召回</div>
                    <div style="font-size: 12px; color: #666;">
                        原因：${Utils.escapeHtml(existingRecall.reason)} · 
                        处理状态：${existingRecall.status === 'processing' ? '处理中' : (existingRecall.status === 'completed' ? '已完成' : '已取消')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            ${recallInfo}
            ${batch ? `
            <div class="trace-batch-info">
                <div style="font-size: 16px; font-weight: 600; color: #333; margin-bottom: 8px;">
                    ${Utils.escapeHtml(batch.vaccineName)}
                    <span class="batch-status ${batchStatus.class}" style="margin-left: 10px;">${batchStatus.text}</span>
                </div>
                <div style="font-size: 13px; color: #666; font-family: 'Courier New', monospace;">
                    批号：${Utils.escapeHtml(batch.batchNo)}
                </div>
                <div style="font-size: 12px; color: #999; margin-top: 4px;">
                    ${Utils.escapeHtml(batch.manufacturer || '-')} · 有效期至 ${batch.expireDate}
                </div>
                <div class="trace-stats">
                    <div class="trace-stat">
                        <span class="trace-stat-num">${records.length}</span>
                        <span class="trace-stat-label">总接种数</span>
                    </div>
                    <div class="trace-stat">
                        <span class="trace-stat-num" style="color: #52c41a;">${doneCount}</span>
                        <span class="trace-stat-label">正常</span>
                    </div>
                    <div class="trace-stat">
                        <span class="trace-stat-num" style="color: #ff4d4f;">${recalledCount}</span>
                        <span class="trace-stat-label">已召回</span>
                    </div>
                </div>
            </div>
            ` : ''}
            <div class="vaccination-list">
                ${records.length === 0 ? `
                    <div class="empty-tip" style="padding: 40px 20px;">该批次暂无接种记录</div>
                ` : records.map(r => this.renderVaccinationItem(r)).join('')}
            </div>
            ${!existingRecall && records.length > 0 ? `
                <div style="padding: 12px 16px; border-top: 1px solid #f0f0f0;">
                    <button class="btn btn-danger btn-block" onclick="RecallModule.openCreateModalWithBatch('${Utils.escapeHtml(batchNo)}')">
                        ⚠️ 发起该批次召回
                    </button>
                </div>
            ` : ''}
        `;
    },

    renderVaccinationItem(record) {
        return `
            <div class="vaccination-item">
                <div class="vaccination-avatar">${Utils.getPetEmoji(record.petType)}</div>
                <div class="vaccination-info">
                    <div class="vaccination-main">
                        <span class="vaccination-pet">${Utils.escapeHtml(record.petName)}</span>
                        <span class="vaccination-type">${Utils.escapeHtml(record.petType)}</span>
                    </div>
                    <div class="vaccination-owner">
                        宠主：${Utils.escapeHtml(record.ownerName)} · ${Utils.maskPhone(record.ownerPhone)}
                    </div>
                    <div class="vaccination-date">
                        接种时间：${record.vaccinationDate} ${record.vaccinationTime}
                    </div>
                </div>
                <span class="vaccination-status ${record.status === 'done' ? 'status-done' : 'status-recalled'}">
                    ${record.status === 'done' ? '正常' : '已召回'}
                </span>
            </div>
        `;
    },

    populateBatchSelect() {
        const select = document.getElementById('recallBatchNo');
        const options = DataStore.data.vaccineBatches
            .filter(b => b.status !== 'recalled' && (b.usedQty || 0) > 0)
            .map(b => `<option value="${Utils.escapeHtml(b.batchNo)}">${b.batchNo} - ${b.vaccineName}（已接种${b.usedQty}剂）</option>`);
        select.innerHTML = '<option value="">请选择批次</option>' + options.join('');
    },

    renderRecallList() {
        const container = document.getElementById('recallList');
        const recalls = DataStore.data.recallRecords;

        if (recalls.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="background: #fff; border-radius: 12px;">
                    暂无召回记录，点击右上角发起新召回
                </div>
            `;
            return;
        }

        container.innerHTML = recalls.map(recall => {
            const level = Utils.getRecallLevel(recall.level);
            return `
                <div class="recall-card" data-recall-id="${recall.id}">
                    <div class="recall-header">
                        <span class="recall-title">${Utils.escapeHtml(recall.vaccineName)}</span>
                        <span class="recall-level ${level.class}">${level.text}</span>
                    </div>
                    <div class="recall-batch">批号：${Utils.escapeHtml(recall.batchNo)}</div>
                    <div class="recall-reason">
                        <b style="color:#666;">原因：</b>${Utils.escapeHtml(recall.reason)}<br>
                        ${Utils.escapeHtml(recall.description)}
                    </div>
                    <div class="recall-footer">
                        <div class="recall-stats">
                            <span class="recall-stat-item">
                                <span class="recall-stat-num">${recall.affectedCount}</span>
                                受影响
                            </span>
                            <span class="recall-stat-item">
                                <span class="recall-stat-num">${recall.notifiedCount}</span>
                                已通知
                            </span>
                        </div>
                        <span>${Utils.getRelativeDateStr(recall.createdAt)}发起</span>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.recall-card').forEach(card => {
            card.addEventListener('click', () => {
                const recallId = card.dataset.recallId;
                this.showDetail(recallId);
            });
        });
    },

    openCreateModal() {
        this.populateBatchSelect();
        document.getElementById('createRecallForm').reset();
        document.getElementById('createRecallModal').classList.add('active');
    },

    openCreateModalWithBatch(batchNo) {
        document.querySelector('.tab-item[data-tab="recall-notify"]').click();
        setTimeout(() => {
            this.populateBatchSelect();
            document.getElementById('createRecallForm').reset();
            const select = document.getElementById('recallBatchNo');
            select.value = batchNo;
            document.getElementById('createRecallModal').classList.add('active');
        }, 100);
    },

    closeCreateModal() {
        document.getElementById('createRecallModal').classList.remove('active');
    },

    handleCreateRecall() {
        const form = document.getElementById('createRecallForm');
        const batchNo = form.recallBatchNo.value;
        const reason = form.recallReason.value;
        const description = form.recallDescription.value.trim();
        const action = form.recallAction.value.trim();
        const notifyAll = form.notifyAll.checked;

        if (!batchNo) { Utils.showToast('请选择问题批号', 'error'); return; }
        if (!reason) { Utils.showToast('请选择召回原因', 'error'); return; }
        if (!description) { Utils.showToast('请填写召回说明', 'error'); return; }

        const batch = DataStore.data.vaccineBatches.find(b => b.batchNo === batchNo);
        if (!batch) {
            Utils.showToast('批次不存在', 'error');
            return;
        }

        const affectedCount = DataStore.getRecordsByBatch(batchNo).length;
        if (affectedCount === 0) {
            Utils.showToast('该批次暂无接种记录，无需召回', 'warning');
            return;
        }

        let level = 'low';
        if (reason === '质量问题' || reason === '厂家召回') level = 'high';
        else if (reason === '存储不当') level = 'medium';

        DataStore.addRecall({
            batchNo,
            batchId: batch.id,
            vaccineName: batch.vaccineName,
            reason,
            description,
            action,
            level,
            notifyAll
        });

        Utils.showToast('召回已发起，通知已推送', 'success');
        this.closeCreateModal();
        this.render();
        BatchModule.render();
        App.updateDashboardStats();
    },

    showDetail(recallId) {
        const recall = DataStore.data.recallRecords.find(r => r.id === recallId);
        if (!recall) return;

        const level = Utils.getRecallLevel(recall.level);
        const records = DataStore.getRecordsByBatch(recall.batchNo);
        const notifiedCount = recall.notifiedCount;
        const pendingCount = records.length - notifiedCount;

        const content = document.getElementById('recallDetailContent');
        content.innerHTML = `
            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item full">
                        <div class="detail-label">疫苗</div>
                        <div class="detail-value">${Utils.escapeHtml(recall.vaccineName)}</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">批号</div>
                        <div class="detail-value" style="font-family: 'Courier New', monospace;">${Utils.escapeHtml(recall.batchNo)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">紧急程度</div>
                        <div class="detail-value"><span class="recall-level ${level.class}">${level.text}</span></div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">处理状态</div>
                        <div class="detail-value">
                            ${recall.status === 'processing' ? '<span style="color:#1677ff;">处理中</span>' : 
                              (recall.status === 'completed' ? '<span style="color:#52c41a;">已完成</span>' : 
                               '<span style="color:#999;">已取消</span>')}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">受影响宠物</div>
                        <div class="detail-value highlight">${recall.affectedCount} 只</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">已通知宠主</div>
                        <div class="detail-value success">${recall.notifiedCount} 人</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">召回原因</div>
                        <div class="detail-value">${Utils.escapeHtml(recall.reason)}</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">详细说明</div>
                        <div class="detail-value" style="line-height: 1.6;">${Utils.escapeHtml(recall.description)}</div>
                    </div>
                    ${recall.action ? `
                    <div class="detail-item full">
                        <div class="detail-label">处理建议</div>
                        <div class="detail-value" style="line-height: 1.6;">${Utils.escapeHtml(recall.action)}</div>
                    </div>
                    ` : ''}
                    <div class="detail-item full">
                        <div class="detail-label">发起时间</div>
                        <div class="detail-value">${recall.createdAt} · ${recall.createdBy}</div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">受影响宠物列表（${records.length}条）</div>
                <div class="detail-item-list">
                    ${records.map((r, idx) => `
                        <div class="record-item">
                            <div class="record-header">
                                <span class="record-title">
                                    ${idx + 1}. ${Utils.getPetEmoji(r.petType)} ${Utils.escapeHtml(r.petName)}
                                </span>
                                <span class="appointment-tag status-${r.status === 'recalled' ? 'cancelled' : 'completed'}">
                                    ${r.status === 'recalled' ? '已标记召回' : '待处理'}
                                </span>
                            </div>
                            <div class="record-desc">
                                宠主：${Utils.escapeHtml(r.ownerName)} · ${Utils.maskPhone(r.ownerPhone)}
                            </div>
                            <div class="record-desc">
                                接种：${r.vaccinationDate} ${r.vaccinationTime}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            ${pendingCount > 0 ? `
                <div class="action-group">
                    <button class="btn btn-primary btn-block" onclick="RecallModule.resendNotifications('${recall.id}')">
                        📨 再次推送剩余${pendingCount}条通知
                    </button>
                </div>
            ` : ''}

            ${recall.status === 'processing' ? `
                <div class="action-group">
                    <button class="btn btn-outline btn-block" onclick="RecallModule.completeRecall('${recall.id}')">
                        ✓ 标记为处理完成
                    </button>
                </div>
            ` : ''}
        `;

        document.getElementById('recallDetailDrawer').classList.add('active');
    },

    closeDetailDrawer() {
        document.getElementById('recallDetailDrawer').classList.remove('active');
    },

    resendNotifications(recallId) {
        const recall = DataStore.data.recallRecords.find(r => r.id === recallId);
        if (!recall) return;

        const records = DataStore.getRecordsByBatch(recall.batchNo);
        records.forEach(r => {
            r.status = 'recalled';
        });
        recall.notifiedCount = records.length;
        DataStore.save();

        DataStore.addNotification({
            type: 'recall',
            title: '召回通知重发',
            content: `${recall.vaccineName}（${recall.batchNo}）召回通知已重新推送给全部${records.length}位宠主。`,
            relatedId: recallId
        });

        Utils.showToast('已推送全部通知', 'success');
        this.showDetail(recallId);
        App.updateDashboardStats();
    },

    completeRecall(recallId) {
        const recall = DataStore.data.recallRecords.find(r => r.id === recallId);
        if (recall) {
            recall.status = 'completed';
            DataStore.save();
            Utils.showToast('已标记为处理完成', 'success');
            this.renderRecallList();
            this.closeDetailDrawer();
        }
    }
};