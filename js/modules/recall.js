const RecallModule = {
    currentSearchBatchNo: '',
    currentDetailRecallId: null,

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

        document.getElementById('closeRecallAppoint').addEventListener('click', () => this.closeRecallAppointModal());
        document.getElementById('cancelRecallAppoint').addEventListener('click', () => this.closeRecallAppointModal());
        document.getElementById('confirmRecallAppoint').addEventListener('click', () => this.handleRecallAppoint());
    },

    openRecallAppointModal(recallId, recordId, appointType) {
        const record = DataStore.data.vaccinationRecords.find(r => r.id === recordId);
        if (!record) return;

        document.getElementById('recallAppointRecordId').value = recordId;
        document.getElementById('recallAppointType').value = appointType;
        document.getElementById('recallAppointTitle').textContent = appointType === 'revaccinate' ? '安排补种预约' : '安排复查预约';
        document.getElementById('recallAppointPetInfo').innerHTML = `
            <div style="margin-bottom:4px;">
                <b>${Utils.getPetEmoji(record.petType)} ${Utils.escapeHtml(record.petName)}</b>
                <span style="color:#999; font-size:12px; margin-left:8px;">${Utils.escapeHtml(record.petType)}</span>
            </div>
            <div style="color:#666; margin-bottom:4px;">宠主：${Utils.escapeHtml(record.ownerName)} · ${Utils.maskPhone(record.ownerPhone)}</div>
            <div style="color:#666;">原接种：${record.vaccinationDate} ${record.vaccinationTime} · 批次 ${record.batchNo}</div>
        `;

        const today = new Date();
        const dateInput = document.getElementById('recallAppointDate');
        dateInput.value = Utils.getDateStr(1);
        dateInput.min = Utils.getTodayStr();
        dateInput.onchange = () => this.populateRecallAppointTimeSlots();

        const batchGroup = document.getElementById('recallAppointBatchGroup');
        if (appointType === 'revaccinate') {
            batchGroup.style.display = '';
            const availableBatches = DataStore.getAvailableBatchesForVaccine(record.vaccineName);
            const batchSelect = document.getElementById('recallAppointBatchId');
            batchSelect.innerHTML = availableBatches.length === 0
                ? '<option value="">暂无可用批次</option>'
                : '<option value="">请选择可用批次</option>' + availableBatches.map(b =>
                    `<option value="${b.id}">${b.batchNo} · 可用${b.availableQty}剂 · 效期${b.expireDate}</option>`
                ).join('');
        } else {
            batchGroup.style.display = 'none';
            document.getElementById('recallAppointBatchId').value = '';
        }

        this.populateRecallAppointTimeSlots();
        document.getElementById('recallAppointModal').classList.add('active');
    },

    populateRecallAppointTimeSlots() {
        const date = document.getElementById('recallAppointDate').value;
        const slotSelect = document.getElementById('recallAppointTimeSlot');
        if (!date) { slotSelect.innerHTML = '<option value="">请先选择日期</option>'; return; }

        const timeRanges = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30',
            '14:00-14:30', '14:30-15:00', '15:00-15:30', '15:30-16:00', '16:00-16:30', '16:30-17:00'];

        slotSelect.innerHTML = '<option value="">请选择时段</option>' + timeRanges.map(slot => {
            const booked = DataStore.getSlotBooked(date, slot);
            const capacity = DataStore.getSlotCapacity(date, slot);
            const disabled = booked >= capacity ? 'disabled' : '';
            const suffix = booked >= capacity ? '（已满）' : `（${booked}/${capacity}）`;
            return `<option value="${slot}" ${disabled}>${slot}${suffix}</option>`;
        }).join('');
    },

    closeRecallAppointModal() {
        document.getElementById('recallAppointModal').classList.remove('active');
    },

    handleRecallAppoint() {
        const recordId = document.getElementById('recallAppointRecordId').value;
        const appointType = document.getElementById('recallAppointType').value;
        const date = document.getElementById('recallAppointDate').value;
        const timeSlot = document.getElementById('recallAppointTimeSlot').value;
        const batchId = document.getElementById('recallAppointBatchId').value;

        if (!date) { Utils.showToast('请选择日期', 'error'); return; }
        if (!timeSlot) { Utils.showToast('请选择时段', 'error'); return; }
        if (appointType === 'revaccinate' && !batchId) { Utils.showToast('请选择补种批次', 'error'); return; }

        const aptData = { date, timeSlot, vaccineBatchId: batchId || null };
        const recallId = this.currentDetailRecallId;

        const result = appointType === 'revaccinate'
            ? DataStore.createRecallRevaccinateAppointment(recallId, recordId, aptData)
            : DataStore.createRecallReexamAppointment(recallId, recordId, aptData);

        if (result.success) {
            Utils.showToast(appointType === 'revaccinate' ? '补种预约已安排' : '复查预约已安排', 'success');
            this.closeRecallAppointModal();
            this.render();
            this.showDetail(recallId);
            ScheduleModule.render();
            BatchModule.render();
            App.updateDashboardStats();
        } else {
            if (result.type === 'no_stock') {
                Utils.showToast('⚠️ 该批次库存不足，请重新选择', 'error');
            } else {
                Utils.showToast(result.message || '预约失败', 'error');
            }
        }
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
            const stats = DataStore.getRecallPetStats(existingRecall.id);
            const pendingCount = stats.total - stats.completed;
            recallInfo = `
                <div class="recall-summary">
                    <div style="font-weight: 600; color: #ff4d4f; margin-bottom: 6px;">⚠️ 该批次已发起召回</div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
                        原因：${Utils.escapeHtml(existingRecall.reason)} · 
                        处理状态：${existingRecall.status === 'processing' ? '处理中' : (existingRecall.status === 'completed' ? '已完成' : '已取消')}
                    </div>
                    <div style="font-size: 12px; color: #999;">
                        待处理 <b style="color:#ff4d4f;">${pendingCount}</b> 只 · 
                        已完成 <b style="color:#52c41a;">${stats.completed}</b> 只
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
                ` : records.map(r => this.renderVaccinationItem(r, existingRecall)).join('')}
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

    renderVaccinationItem(record, recall) {
        let statusTag = '';
        if (recall) {
            const petStatus = DataStore.getRecallPetStatus(recall.id, record.id);
            const status = petStatus ? petStatus.status : 'pending';
            const label = DataStore.RECALL_PET_STATUS_LABELS[status] || status;
            const colorMap = {
                pending: '#999',
                notified: '#1677ff',
                contacted: '#fa8c16',
                reexamined: '#722ed1',
                revaccinated: '#52c41a',
                no_action: '#8c8c8c'
            };
            statusTag = `<span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${colorMap[status] || '#999'}20; color:${colorMap[status] || '#999'};">${label}</span>`;
        } else {
            statusTag = `<span class="vaccination-status ${record.status === 'done' ? 'status-done' : 'status-recalled'}">
                ${record.status === 'done' ? '正常' : '已召回'}
            </span>`;
        }

        const revacTag = record.isRevaccinate
            ? `<span style="font-size:10px; padding:1px 6px; background:#fff7e6; color:#fa8c16; border-radius:3px; margin-left:4px;">召回补种</span>`
            : '';

        const revacInfo = record.revaccinationRecordId
            ? `<div class="vaccination-date" style="color:#52c41a;">🔗 已补种：新批次 ${record.revaccinateBatchId ? DataStore.getBatch(record.revaccinateBatchId)?.batchNo || '-' : '-'}</div>`
            : '';
        const originInfo = record.fromRecallId && record.originalRecordId
            ? `<div class="vaccination-date" style="color:#fa8c16;">🔗 来源召回：原批次 ${DataStore.data.vaccinationRecords.find(x => x.id === record.originalRecordId)?.batchNo || '-'}</div>`
            : '';

        return `
            <div class="vaccination-item">
                <div class="vaccination-avatar">${Utils.getPetEmoji(record.petType)}</div>
                <div class="vaccination-info">
                    <div class="vaccination-main">
                        <span class="vaccination-pet">${Utils.escapeHtml(record.petName)}</span>
                        <span class="vaccination-type">${Utils.escapeHtml(record.petType)}</span>
                        ${revacTag}
                    </div>
                    <div class="vaccination-owner">
                        宠主：${Utils.escapeHtml(record.ownerName)} · ${Utils.maskPhone(record.ownerPhone)}
                    </div>
                    <div class="vaccination-date">
                        接种时间：${record.vaccinationDate} ${record.vaccinationTime}
                    </div>
                    ${revacInfo}
                    ${originInfo}
                </div>
                ${statusTag}
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
            const stats = DataStore.getRecallPetStats(recall.id);
            const pendingCount = stats.total - stats.completed;
            const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

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
                    <div style="margin-top: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span style="color: #999;">处理进度</span>
                            <span style="color: #666;">${stats.completed}/${stats.total}（${progress}%）</span>
                        </div>
                        <div class="stock-bar">
                            <div class="stock-bar-fill bar-green" style="width: ${progress}%;"></div>
                        </div>
                    </div>
                    <div class="recall-footer">
                        <div class="recall-stats">
                            <span class="recall-stat-item">
                                <span class="recall-stat-num" style="color:#ff4d4f;">${pendingCount}</span>
                                待处理
                            </span>
                            <span class="recall-stat-item">
                                <span class="recall-stat-num" style="color:#52c41a;">${stats.completed}</span>
                                已完成
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
        this.currentDetailRecallId = recallId;
        const recall = DataStore.data.recallRecords.find(r => r.id === recallId);
        if (!recall) return;

        const level = Utils.getRecallLevel(recall.level);
        const records = DataStore.getRecordsByBatch(recall.batchNo);
        const stats = DataStore.getRecallPetStats(recallId);
        const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

        const content = document.getElementById('recallDetailContent');

        const statusTabs = DataStore.RECALL_PET_STATUS_ORDER.map(status => {
            const count = stats[status] || 0;
            const label = DataStore.RECALL_PET_STATUS_LABELS[status];
            return `
                <span style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; font-size:12px;">
                    <span style="width:8px; height:8px; border-radius:50%; background:${this.getStatusColor(status)};"></span>
                    ${label}: ${count}
                </span>
            `;
        }).join('');

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
                    <div class="detail-item full">
                        <div class="detail-label">处理进度</div>
                        <div style="margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                                <span style="color: #999;">${stats.completed}/${stats.total}</span>
                                <span style="color: #52c41a; font-weight: 500;">${progress}%</span>
                            </div>
                            <div class="stock-bar" style="height: 8px;">
                                <div class="stock-bar-fill bar-green" style="width: ${progress}%;"></div>
                            </div>
                            <div style="margin-top: 8px; line-height: 1.8;">
                                ${statusTabs}
                            </div>
                        </div>
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
                    ${records.map((r, idx) => this.renderPetStatusItem(recallId, r, idx)).join('')}
                </div>
            </div>

            ${recall.status === 'processing' ? `
                <div class="action-group">
                    <button class="btn btn-outline btn-block" onclick="RecallModule.completeRecall('${recallId}')">
                        ✓ 标记为处理完成
                    </button>
                </div>
            ` : ''}
        `;

        content.querySelectorAll('.pet-status-selector select').forEach(select => {
            select.addEventListener('change', (e) => {
                const recordId = e.target.dataset.recordId;
                const newStatus = e.target.value;
                this.updatePetStatus(recallId, recordId, newStatus);
            });
        });

        document.getElementById('recallDetailDrawer').classList.add('active');
    },

    getStatusColor(status) {
        const map = {
            pending: '#bfbfbf',
            notified: '#1677ff',
            contacted: '#fa8c16',
            reexamined: '#722ed1',
            revaccinated: '#52c41a',
            no_action: '#8c8c8c'
        };
        return map[status] || '#999';
    },

    renderPetStatusItem(recallId, record, idx) {
        const petStatus = DataStore.getRecallPetStatus(recallId, record.id);
        const currentStatus = petStatus ? petStatus.status : 'pending';
        const remark = petStatus ? petStatus.remark : '';
        const reexamApt = petStatus?.reexamAppointmentId
            ? DataStore.data.appointments.find(a => a.id === petStatus.reexamAppointmentId)
            : null;
        const revaccinateApt = petStatus?.revaccinateAppointmentId
            ? DataStore.data.appointments.find(a => a.id === petStatus.revaccinateAppointmentId)
            : null;
        const revaccinationDone = petStatus?.revaccinationRecordId
            ? DataStore.data.vaccinationRecords.find(r => r.id === petStatus.revaccinationRecordId)
            : null;
        const hasRevacChain = revaccinationDone || (revaccinateApt && revaccinateApt.status === 'completed');
        const expandedKey = `recall_recon_${recallId}_${record.id}`;
        const isExpanded = this.reconciliationExpanded?.[expandedKey];

        const options = DataStore.RECALL_PET_STATUS_ORDER.map(status => {
            const label = DataStore.RECALL_PET_STATUS_LABELS[status];
            return `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${label}</option>`;
        }).join('');

        let appointmentInfo = '';
        if (reexamApt) {
            appointmentInfo += `<div class="record-desc" style="color:#1677ff;">📅 复查预约：${reexamApt.date} ${reexamApt.timeSlot}
                <span style="font-size:10px; padding:1px 6px; background:#e6f4ff; border-radius:3px; margin-left:4px;">${reexamApt.status === 'completed' ? '已完成' : (reexamApt.status === 'cancelled' ? '已取消' : '待就诊')}</span>
            </div>`;
        }
        if (revaccinateApt) {
            const batch = petStatus?.revaccinateBatchId ? DataStore.getBatch(petStatus.revaccinateBatchId) : null;
            appointmentInfo += `<div class="record-desc" style="color:#52c41a;">💉 补种预约：${revaccinateApt.date} ${revaccinateApt.timeSlot}
                <span style="font-size:10px; padding:1px 6px; background:#f6ffed; border-radius:3px; margin-left:4px;">${revaccinationDone ? '已完成' : (revaccinateApt.status === 'cancelled' ? '已取消' : '待接种')}</span>
                ${batch ? `<span style="color:#8c8c8c; margin-left:4px;">（批次：${batch.batchNo}）</span>` : ''}
            </div>`;
        }

        const reconBtn = hasRevacChain
            ? `<button class="btn btn-outline" style="font-size:11px; padding:0 10px; height:30px;" onclick="RecallModule.toggleReconciliation('${recallId}', '${record.id}')">
                    ${isExpanded ? '收起' : '📊'} 对账
                </button>`
            : '';

        const reconContent = (isExpanded && hasRevacChain)
            ? `<div style="margin-top: 10px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #1677ff;">
                    ${this.renderReconciliationTimeline(recallId, record.id)}
                </div>`
            : '';

        return `
            <div class="record-item">
                <div class="record-header">
                    <span class="record-title">
                        ${idx + 1}. ${Utils.getPetEmoji(record.petType)} ${Utils.escapeHtml(record.petName)}
                        <span style="font-size: 11px; color: #999; font-weight: normal; margin-left: 6px;">
                            ${Utils.escapeHtml(record.petType)}
                        </span>
                    </span>
                </div>
                <div class="record-desc">
                    宠主：${Utils.escapeHtml(record.ownerName)} · ${Utils.maskPhone(record.ownerPhone)}
                </div>
                <div class="record-desc">
                    接种：${record.vaccinationDate} ${record.vaccinationTime} · 批次 ${record.batchNo}
                </div>
                ${appointmentInfo}
                <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <div class="pet-status-selector" style="flex: 1; min-width: 140px;">
                        <select class="form-input" data-record-id="${record.id}" style="font-size: 12px; height: 32px;">
                            ${options}
                        </select>
                    </div>
                    <button class="btn btn-outline" style="font-size:11px; padding:0 10px; height:30px;" onclick="RecallModule.openRecallAppointModal('${recallId}', '${record.id}', 'reexam')">
                        📅 复查
                    </button>
                    <button class="btn btn-primary" style="font-size:11px; padding:0 10px; height:30px;" onclick="RecallModule.openRecallAppointModal('${recallId}', '${record.id}', 'revaccinate')">
                        💉 补种
                    </button>
                    ${reconBtn}
                    ${remark ? `
                        <span style="font-size: 11px; color: #999; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${Utils.escapeHtml(remark)}
                        </span>
                    ` : ''}
                </div>
                ${reconContent}
            </div>
        `;
    },

    reconciliationExpanded: {},

    toggleReconciliation(recallId, recordId) {
        const key = `recall_recon_${recallId}_${recordId}`;
        if (!this.reconciliationExpanded) this.reconciliationExpanded = {};
        this.reconciliationExpanded[key] = !this.reconciliationExpanded[key];
        this.showDetail(recallId);
    },

    renderReconciliationTimeline(recallId, recordId) {
        const record = DataStore.data.vaccinationRecords.find(r => r.id === recordId);
        if (!record) return '';
        const petStatus = DataStore.getRecallPetStatus(recallId, recordId);
        if (!petStatus) return '';

        const nodes = [];

        nodes.push({
            type: 'origin',
            icon: '💉',
            color: '#1677ff',
            title: '原接种',
            subtitle: `${record.vaccinationDate} ${record.vaccinationTime}`,
            desc: `批次 ${record.batchNo} · 宠主 ${record.ownerName}`,
            action: () => {
                App.navigateTo('page-batch');
                setTimeout(() => {
                    const batch = DataStore.data.vaccineBatches.find(b => b.batchNo === record.batchNo);
                    if (batch) BatchModule.showDetail(batch.id);
                }, 100);
            }
        });

        nodes.push({
            type: 'freeze',
            icon: '❄️',
            color: '#722ed1',
            title: '召回冻结',
            subtitle: petStatus.updatedAt ? Utils.formatDate(petStatus.updatedAt, 'MM-DD HH:mm') : '-',
            desc: `状态：${DataStore.RECALL_PET_STATUS_LABELS[petStatus.status] || petStatus.status}`,
            action: () => Utils.showToast('召回详情当前页面', 'info')
        });

        if (petStatus.reexamAppointmentId) {
            const apt = DataStore.data.appointments.find(a => a.id === petStatus.reexamAppointmentId);
            if (apt) {
                nodes.push({
                    type: 'reexam',
                    icon: '📅',
                    color: '#1677ff',
                    title: '复查预约',
                    subtitle: `${apt.date} ${apt.timeSlot}`,
                    desc: `状态：${apt.status === 'completed' ? '已完成' : (apt.status === 'cancelled' ? '已取消' : '待就诊')}`,
                    action: () => {
                        App.navigateTo('page-schedule');
                        Utils.showToast('已跳转到排期页面', 'info');
                    }
                });
            }
        }

        if (petStatus.revaccinateAppointmentId) {
            const apt = DataStore.data.appointments.find(a => a.id === petStatus.revaccinateAppointmentId);
            const batch = petStatus.revaccinateBatchId ? DataStore.getBatch(petStatus.revaccinateBatchId) : null;
            if (apt) {
                nodes.push({
                    type: 'revac_apt',
                    icon: '💉',
                    color: '#fa8c16',
                    title: '补种预约',
                    subtitle: `${apt.date} ${apt.timeSlot}`,
                    desc: `新批次：${batch ? batch.batchNo : '-'} · ${batch ? `可用${batch.availableQty}剂` : ''}`,
                    action: () => {
                        App.navigateTo('page-schedule');
                        Utils.showToast('已跳转到排期页面', 'info');
                    }
                });

                const freezeLedger = DataStore.data.stockLedger.find(
                    l => l.batchId === petStatus.revaccinateBatchId && l.relatedId === apt.id && l.type === DataStore.STOCK_LEDGER_TYPES.APPOINTMENT_RESERVE
                );
                if (freezeLedger) {
                    nodes.push({
                        type: 'stock_reserve',
                        icon: '📦',
                        color: '#fa8c16',
                        title: '库存·预约占用',
                        subtitle: Utils.formatDate(freezeLedger.createdAt, 'MM-DD HH:mm'),
                        desc: `批次 ${batch?.batchNo || '-'} · -1剂 · 余${freezeLedger.afterQty}剂`,
                        action: () => {
                            App.navigateTo('page-batch');
                            setTimeout(() => {
                                if (petStatus.revaccinateBatchId) BatchModule.showDetail(petStatus.revaccinateBatchId);
                            }, 100);
                        }
                    });
                }
            }
        }

        if (petStatus.revaccinationRecordId) {
            const revac = DataStore.data.vaccinationRecords.find(r => r.id === petStatus.revaccinationRecordId);
            const batch = petStatus.revaccinateBatchId ? DataStore.getBatch(petStatus.revaccinateBatchId) : null;
            if (revac) {
                nodes.push({
                    type: 'revac_done',
                    icon: '✅',
                    color: '#52c41a',
                    title: '补种完成',
                    subtitle: `${revac.vaccinationDate} ${revac.vaccinationTime}`,
                    desc: `新批次 ${batch?.batchNo || '-'} · 已接种`,
                    action: () => {
                        App.navigateTo('page-batch');
                        setTimeout(() => {
                            if (petStatus.revaccinateBatchId) BatchModule.showDetail(petStatus.revaccinateBatchId);
                        }, 100);
                    }
                });

                const deductLedger = DataStore.data.stockLedger.find(
                    l => l.batchId === petStatus.revaccinateBatchId && l.relatedId === revac.id &&
                        (l.type === DataStore.STOCK_LEDGER_TYPES.VACCINATE_DEDUCT || l.type === DataStore.STOCK_LEDGER_TYPES.REVACCINATE_ADD)
                );
                if (deductLedger) {
                    nodes.push({
                        type: 'stock_deduct',
                        icon: '📉',
                        color: '#52c41a',
                        title: '库存·接种扣减',
                        subtitle: Utils.formatDate(deductLedger.createdAt, 'MM-DD HH:mm'),
                        desc: `批次 ${batch?.batchNo || '-'} · -1剂 · 余${deductLedger.afterQty}剂`,
                        action: () => {
                            App.navigateTo('page-batch');
                            setTimeout(() => {
                                if (petStatus.revaccinateBatchId) BatchModule.showDetail(petStatus.revaccinateBatchId);
                            }, 100);
                        }
                    });
                }
            }
        }

        if (record.revaccinationRecordId) {
            nodes.push({
                type: 'link',
                icon: '🔗',
                color: '#8c8c8c',
                title: '双向关联已建立',
                subtitle: '闭环完成',
                desc: '原接种↔补种接种 双向关联',
                action: () => Utils.showToast('召回补种闭环已验证完成', 'success')
            });
        }

        let html = '<div style="position: relative; padding-left: 24px;">';
        nodes.forEach((node, i) => {
            const isLast = i === nodes.length - 1;
            html += `
                <div style="position: relative; margin-bottom: ${isLast ? '0' : '16px'};">
                    <div style="position: absolute; left: -24px; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: ${node.color}20; display: flex; align-items: center; justify-content: center; font-size: 11px;">
                        ${node.icon}
                    </div>
                    ${!isLast ? `<div style="position: absolute; left: -15px; top: 22px; bottom: -16px; width: 2px; background: ${node.color}30;"></div>` : ''}
                    <div style="cursor: pointer;" onclick="RecallModule.jumpFromReconciliation('${node.type}', '${recallId}', '${recordId}')">
                        <div style="font-size: 13px; font-weight: 500; color: #333;">
                            ${node.title}
                            <span style="font-size: 10px; color: ${node.color}; margin-left: 6px;">点击跳转 →</span>
                        </div>
                        <div style="font-size: 11px; color: #8c8c8c; margin-top: 2px;">${node.subtitle}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">${node.desc}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        return html;
    },

    jumpFromReconciliation(type, recallId, recordId) {
        const petStatus = DataStore.getRecallPetStatus(recallId, recordId);
        if (!petStatus) return;
        const record = DataStore.data.vaccinationRecords.find(r => r.id === recordId);

        switch (type) {
            case 'origin':
                if (record) {
                    App.navigateTo('page-batch');
                    setTimeout(() => {
                        const batch = DataStore.data.vaccineBatches.find(b => b.batchNo === record.batchNo);
                        if (batch) BatchModule.showDetail(batch.id);
                    }, 100);
                }
                break;
            case 'freeze':
            case 'reexam':
            case 'revac_apt':
                App.navigateTo('page-schedule');
                Utils.showToast('请在排期页面查看对应预约', 'info');
                break;
            case 'stock_reserve':
            case 'stock_deduct':
            case 'revac_done':
                if (petStatus.revaccinateBatchId) {
                    App.navigateTo('page-batch');
                    setTimeout(() => BatchModule.showDetail(petStatus.revaccinateBatchId), 100);
                }
                break;
            case 'link':
                Utils.showToast('✅ 召回补种闭环验证完成', 'success');
                break;
        }
    },

    updatePetStatus(recallId, recordId, newStatus) {
        DataStore.setRecallPetStatus(recallId, recordId, newStatus);

        const recall = DataStore.data.recallRecords.find(r => r.id === recallId);
        if (recall && newStatus === 'revaccinated') {
            const record = DataStore.data.vaccinationRecords.find(r => r.id === recordId);
            if (record) {
                const availableBatches = DataStore.getAvailableBatchesForVaccine(record.vaccineName);
                if (availableBatches.length > 0 && availableBatches[0].id !== recall.batchId) {
                    const newBatch = availableBatches[0];
                    Utils.showToast(`状态已更新：${DataStore.RECALL_PET_STATUS_LABELS[newStatus]}（新批次：${newBatch.batchNo}）`, 'success', 3000);
                } else {
                    Utils.showToast(`状态已更新：${DataStore.RECALL_PET_STATUS_LABELS[newStatus]}`, 'success');
                }
            }
        } else {
            Utils.showToast(`状态已更新：${DataStore.RECALL_PET_STATUS_LABELS[newStatus]}`, 'success');
        }

        this.renderRecallList();
        this.showDetail(recallId);
        App.updateDashboardStats();
    },

    closeDetailDrawer() {
        this.currentDetailRecallId = null;
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
        this.render();
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
            App.updateDashboardStats();
        }
    }
};