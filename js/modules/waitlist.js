const WaitlistModule = {
    currentDetailWaitlistId: null,
    uiRefreshTimer: null,
    dateFilter: '',

    init() {
        this.bindEvents();
        this.render();
        this.startUiRefresh();
    },

    startUiRefresh() {
        if (this.uiRefreshTimer) clearInterval(this.uiRefreshTimer);
        this.uiRefreshTimer = setInterval(() => {
            if (App.currentPage === 'page-waitlist') {
                this.refreshCountdowns();
                if (this.currentDetailWaitlistId) {
                    this.refreshDetailCountdown();
                }
            }
        }, 1000);
    },

    refreshCountdowns() {
        const items = document.querySelectorAll('#waitlistList .waitlist-item');
        if (!items || items.length === 0) return;

        const now = new Date();
        items.forEach(item => {
            const entryId = item.dataset.entryId;
            const entry = DataStore.data.waitlistEntries.find(e => e.id === entryId);
            if (!entry || entry.status !== 'notified' || !entry.notifiedAt) return;

            const notified = new Date(entry.notifiedAt);
            const timeoutMs = (entry.notifyExpireMinutes || 15) * 60 * 1000;
            const remainMs = timeoutMs - (now - notified);
            const extraEl = item.querySelector('.waitlist-countdown-extra');
            if (extraEl) {
                if (remainMs > 0) {
                    const remainSec = Math.ceil(remainMs / 1000);
                    const min = Math.floor(remainSec / 60);
                    const sec = remainSec % 60;
                    extraEl.innerHTML = `<span style="color:#ff4d4f; font-size:11px;">⏳ ${min}分${String(sec).padStart(2, '0')}秒后超时</span>`;
                } else {
                    extraEl.innerHTML = `<span style="color:#999; font-size:11px;">即将超时</span>`;
                }
            }
        });
    },

    refreshDetailCountdown() {
        if (!this.currentDetailWaitlistId) return;
        const entry = DataStore.data.waitlistEntries.find(e => e.id === this.currentDetailWaitlistId);
        if (!entry) return;
    },

    bindEvents() {
        document.getElementById('addWaitlistBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('closeAddWaitlist').addEventListener('click', () => this.closeAddModal());
        document.getElementById('cancelAddWaitlist').addEventListener('click', () => this.closeAddModal());
        document.getElementById('confirmAddWaitlist').addEventListener('click', () => this.handleAddWaitlist());

        document.getElementById('closeWaitlistDetail').addEventListener('click', () => this.closeDetailDrawer());
        document.querySelector('#waitlistDetailDrawer .drawer-mask').addEventListener('click', () => this.closeDetailDrawer());

        document.querySelectorAll('#page-waitlist .tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#page-waitlist .tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.querySelectorAll('#page-waitlist .tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById('tab-' + target).classList.add('active');
                if (target === 'waitlist-notify') {
                    this.renderNotificationList();
                }
            });
        });

        document.getElementById('refreshWaitlist').addEventListener('click', () => {
            const count = DataStore.processExpiredWaitlistNotifications();
            Utils.showToast(count > 0 ? `已处理${count}个超时补位` : '暂无超时需处理', count > 0 ? 'success' : 'info');
            this.render();
            ScheduleModule.render();
            App.updateDashboardStats();
        });

        const dateFilter = document.getElementById('waitlistDateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => {
                this.dateFilter = e.target.value;
                this.renderWaitlistList();
            });
        }
    },

    render() {
        this.renderWaitlistList();
        this.populateVaccineAndDate();

        const activeTab = document.querySelector('#page-waitlist .tab-item.active');
        if (activeTab && activeTab.dataset.tab === 'waitlist-notify') {
            this.renderNotificationList();
        }

        if (this.currentDetailWaitlistId) {
            const drawer = document.getElementById('waitlistDetailDrawer');
            if (drawer && drawer.classList.contains('active')) {
                this.showDetail(this.currentDetailWaitlistId);
            }
        }
    },

    populateVaccineAndDate() {
        const vaccineSelect = document.getElementById('waitlistVaccine');
        const vaccines = [...new Set(DataStore.data.vaccineBatches.map(b => b.vaccineName))];
        vaccineSelect.innerHTML = '<option value="">请选择疫苗</option>' +
            vaccines.map(v => `<option value="${Utils.escapeHtml(v)}">${Utils.escapeHtml(v)}</option>`).join('');

        const dateInput = document.getElementById('waitlistDate');
        dateInput.value = Utils.getDateStr(1);
        dateInput.min = Utils.getTodayStr();

        const filterSelect = document.getElementById('waitlistDateFilter');
        if (filterSelect) {
            const dates = [...new Set(DataStore.data.waitlistEntries.map(e => e.date))].sort();
            if (dates.length === 0) dates.push(Utils.getTodayStr(), Utils.getDateStr(1));
            const currentVal = this.dateFilter || '';
            filterSelect.innerHTML = '<option value="">全部日期</option>' +
                dates.map(d => `<option value="${d}" ${d === currentVal ? 'selected' : ''}>${d}（${Utils.getRelativeDateStr(d)}）</option>`).join('');
        }

        const slotContainer = document.getElementById('waitlistTimeSlots');
        if (slotContainer) {
            const timeRanges = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30',
                '14:00-14:30', '14:30-15:00', '15:00-15:30', '15:30-16:00', '16:00-16:30', '16:30-17:00'];
            slotContainer.innerHTML = timeRanges.map(slot => `
                <label class="checkbox-item" style="flex: 0 0 30%; margin-bottom: 6px;">
                    <input type="checkbox" name="preferredSlots" value="${slot}">
                    <span style="font-size: 12px;">${slot}</span>
                </label>
            `).join('');
        }
    },

    renderWaitlistList() {
        const container = document.getElementById('waitlistList');
        let waitlist = DataStore.data.waitlistEntries
            .filter(w => w.status !== 'expired' && w.status !== 'confirmed');

        if (this.dateFilter) {
            waitlist = waitlist.filter(w => w.date === this.dateFilter);
        }

        waitlist = waitlist.sort((a, b) => {
            const statusOrder = { notified: 0, waiting: 1 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.rank - b.rank;
        });

        if (waitlist.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="background: #fff; border-radius: 12px;">
                    暂无候补登记，点击右上角添加
                </div>
            `;
            return;
        }

        const grouped = {};
        waitlist.forEach(entry => {
            const key = `${entry.vaccineName}_${entry.date}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(entry);
        });

        let html = '';
        for (const key in grouped) {
            const entries = grouped[key];
            const first = entries[0];

            const batchAvailable = DataStore.getAvailableBatchesForVaccine(first.vaccineName).length > 0;

            html += `
                <div class="waitlist-group">
                    <div class="waitlist-group-header">
                        <span class="waitlist-group-title">
                            💉 ${Utils.escapeHtml(first.vaccineName)}
                        </span>
                        <span class="waitlist-group-date">
                            ${Utils.getRelativeDateStr(first.date)} · ${entries.length}人候补
                        </span>
                    </div>
                    <div style="font-size: 12px; color: ${batchAvailable ? '#52c41a' : '#ff4d4f'}; margin-bottom: 10px;">
                        ${batchAvailable ? '✓ 有可用批次库存' : '⚠️ 暂无可用批次库存，需等待补货'}
                    </div>
                    ${entries.map(entry => this.renderWaitlistItem(entry)).join('')}
                </div>
            `;
        }

        container.innerHTML = html;

        container.querySelectorAll('.waitlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const entryId = item.dataset.entryId;
                this.showDetail(entryId);
            });
        });
    },

    renderWaitlistItem(entry) {
        const isNotified = entry.status === 'notified';
        const isWaiting = entry.status === 'waiting';
        const hasStock = DataStore.getAvailableBatchesForVaccine(entry.vaccineName).length > 0;

        let statusText, statusClass;
        if (isNotified) {
            statusText = '已通知补位';
            statusClass = 'status-notified';
        } else if (isWaiting && !hasStock) {
            statusText = '等待库存补货';
            statusClass = 'status-expired';
        } else if (isWaiting) {
            statusText = '候补中·等时段';
            statusClass = 'status-waiting';
        } else {
            const s = this.getWaitlistStatusDisplay(entry.status);
            statusText = s.text;
            statusClass = s.class;
        }

        let extraInfo = '';
        if (isNotified && entry.notifiedAt) {
            const now = new Date();
            const notified = new Date(entry.notifiedAt);
            const timeoutMs = (entry.notifyExpireMinutes || 15) * 60 * 1000;
            const remainMs = timeoutMs - (now - notified);
            if (remainMs > 0) {
                const remainMin = Math.ceil(remainMs / 60000);
                extraInfo = `<span style="color:#ff4d4f; font-size:11px;">⏳ ${remainMin}分钟后超时</span>`;
            } else {
                extraInfo = `<span style="color:#999; font-size:11px;">即将超时</span>`;
            }
        } else if (isWaiting && !hasStock) {
            extraInfo = `<span style="color:#fa8c16; font-size:11px;">📦 批次无库存</span>`;
        } else if (isWaiting) {
            extraInfo = `<span style="color:#1677ff; font-size:11px;">🎯 第${entry.rank}顺位</span>`;
        }

        return `
            <div class="waitlist-item" data-entry-id="${entry.id}">
                <div class="waitlist-position">${entry.rank}</div>
                <div class="waitlist-info">
                    <div class="waitlist-pet">
                        ${Utils.getPetEmoji(entry.petType)} ${Utils.escapeHtml(entry.petName)}
                    </div>
                    <div class="waitlist-owner">
                        ${Utils.escapeHtml(entry.ownerName)} · ${Utils.maskPhone(entry.ownerPhone)}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span class="waitlist-status ${statusClass}">${statusText}</span>
                    <div class="waitlist-countdown-extra" style="margin-top: 4px;">${extraInfo}</div>
                </div>
            </div>
        `;
    },

    getWaitlistStatusDisplay(status) {
        const map = {
            waiting: { text: '候补中', class: 'status-waiting' },
            notified: { text: '已通知补位', class: 'status-notified' },
            confirmed: { text: '已确认', class: 'status-confirmed' },
            expired: { text: '已过期', class: 'status-expired' }
        };
        return map[status] || { text: status, class: 'status-expired' };
    },

    getNotifStatusDisplay(status) {
        const map = {
            pending_confirm: { text: '等待确认', color: '#1677ff' },
            confirmed: { text: '已确认', color: '#52c41a' },
            timeout: { text: '已超时', color: '#ff4d4f' },
            skipped: { text: '已跳过', color: '#999' },
            cancelled: { text: '已取消', color: '#999' }
        };
        return map[status] || { text: status, color: '#999' };
    },

    getNotifCauseDisplay(reason) {
        const map = {
            '时段释放': '⏰ 超时释放补位',
            '原预约取消释放': '↩️ 预约取消补位'
        };
        return map[reason] || '🔔 补位通知';
    },

    openAddModal() {
        document.getElementById('addWaitlistForm').reset();
        this.populateVaccineAndDate();
        document.getElementById('addWaitlistModal').classList.add('active');
    },

    closeAddModal() {
        document.getElementById('addWaitlistModal').classList.remove('active');
    },

    handleAddWaitlist() {
        const form = document.getElementById('addWaitlistForm');
        const vaccineName = form.waitlistVaccine.value;
        const date = form.waitlistDate.value;
        const petName = form.waitlistPetName.value.trim();
        const petType = form.waitlistPetType.value;
        const ownerName = form.waitlistOwnerName.value.trim();
        const ownerPhone = form.waitlistOwnerPhone.value.trim();
        const remark = form.waitlistRemark.value.trim();
        const notifyExpireMinutes = parseInt(form.waitlistExpire ? form.waitlistExpire.value : '3') * 24 * 60;

        const preferredSlots = [];
        const slotInputs = document.querySelectorAll('#waitlistTimeSlots input[name="preferredSlots"]:checked');
        slotInputs.forEach(inp => preferredSlots.push(inp.value));

        if (!vaccineName) { Utils.showToast('请选择疫苗', 'error'); return; }
        if (!date) { Utils.showToast('请选择候补日期', 'error'); return; }
        if (!petName) { Utils.showToast('请输入宠物名', 'error'); return; }
        if (!petType) { Utils.showToast('请选择宠物类型', 'error'); return; }
        if (!ownerName) { Utils.showToast('请输入宠主姓名', 'error'); return; }
        if (!ownerPhone || !Utils.validatePhone(ownerPhone)) {
            Utils.showToast('请输入正确的手机号', 'error');
            return;
        }

        const availableBatches = DataStore.getAvailableBatchesForVaccine(vaccineName);
        const hasStock = availableBatches.length > 0;

        const entry = DataStore.addWaitlistEntry({
            vaccineName,
            date,
            petName,
            petType,
            ownerName,
            ownerPhone,
            remark,
            preferredSlots,
            notifyExpireMinutes: notifyExpireMinutes > 0 ? Math.min(notifyExpireMinutes, 60) : 15
        });

        if (!hasStock) {
            Utils.showToast('候补登记成功（暂无可用库存，补货后优先通知）', 'info', 3500);
        } else {
            Utils.showToast('候补登记成功，时段释放后将自动通知', 'success');
        }

        this.closeAddModal();
        this.render();
        ScheduleModule.render();
        BatchModule.render();
        App.updateDashboardStats();
    },

    showDetail(entryId) {
        this.currentDetailWaitlistId = entryId;
        const entry = DataStore.data.waitlistEntries.find(w => w.id === entryId);
        if (!entry) return;

        const statusInfo = this.getWaitlistStatusDisplay(entry.status);

        const notifications = DataStore.data.waitlistNotifications
            .filter(n => n.waitlistId === entryId)
            .sort((a, b) => new Date(b.notifiedAt || b.createdAt) - new Date(a.notifiedAt || a.createdAt));

        const content = document.getElementById('waitlistDetailContent');

        let notifHtml = '';
        if (notifications.length === 0) {
            notifHtml = '<div style="text-align: center; padding: 20px; color: #999; font-size: 13px;">暂无补位通知记录</div>';
        } else {
            notifHtml = notifications.map((n, i) => {
                const statusDisplay = this.getNotifStatusDisplay(n.status);
                const causeLabel = this.getNotifCauseDisplay(n.reason);
                const expireTs = n.notifiedAt ? new Date(new Date(n.notifiedAt).getTime() + (n.notifyExpireMinutes || 15) * 60000) : null;

                let fromText = '';
                if (n.expiredBy) {
                    const prevEntry = DataStore.data.waitlistEntries.find(w => w.id === n.expiredBy);
                    if (prevEntry) {
                        const prevNotif = DataStore.data.waitlistNotifications.find(x => x.id === n.expiredByNotifId);
                        const expireTime = prevNotif && prevNotif.expiredAt
                            ? `（${Utils.formatDate(prevNotif.expiredAt, 'HH:mm')}超时）`
                            : '';
                        fromText = `<div style="margin-top:6px; padding:6px 10px; background:#fff1f0; border-radius:6px; font-size:12px; color:#ff4d4f;">
                            ⬆️ 上一位：${Utils.escapeHtml(prevEntry.petName)} 确认超时 ${expireTime}，顺延至本顺位
                        </div>`;
                    }
                }

                let toText = '';
                if (n.followedBy) {
                    const nextEntry = DataStore.data.waitlistEntries.find(w => w.id === n.followedBy);
                    if (nextEntry) {
                        const expireAt = n.expiredAt || (n.status === 'timeout' && expireTs);
                        const expireStr = expireAt
                            ? `（${Utils.formatDate(expireAt, 'HH:mm')}超时）`
                            : '';
                        toText = `<div style="margin-top:6px; padding:6px 10px; background:#fff7e6; border-radius:6px; font-size:12px; color:#fa8c16;">
                            ⬇️ 下一位：顺延给 ${Utils.escapeHtml(nextEntry.petName)} ${expireStr}
                        </div>`;
                    }
                }

                let metaExtra = '';
                if (n.status === 'confirmed' && n.confirmedAt) {
                    metaExtra = `<div class="record-desc" style="color:#52c41a;">确认时间：${Utils.formatDate(n.confirmedAt, 'MM-DD HH:mm')}</div>`;
                } else if ((n.status === 'timeout' || n.status === 'skipped') && n.expiredAt) {
                    metaExtra = `<div class="record-desc" style="color:#ff4d4f;">${n.status === 'timeout' ? '超时' : '跳过'}时间：${Utils.formatDate(n.expiredAt, 'MM-DD HH:mm')}</div>`;
                }

                return `
                    <div class="record-item" style="${i > 0 ? 'margin-top: 10px;' : ''}">
                        <div class="record-header">
                            <span class="record-title">${causeLabel}</span>
                            <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${statusDisplay.color}15; color:${statusDisplay.color};">${statusDisplay.text}</span>
                        </div>
                        <div class="record-desc">
                            通知时间：${Utils.formatDate(n.notifiedAt || n.createdAt, 'MM-DD HH:mm')}
                        </div>
                        ${n.timeSlot ? `
                            <div class="record-desc">
                                补位时段：${n.timeSlot}
                            </div>
                        ` : ''}
                        ${n.notifyExpireMinutes ? `
                            <div class="record-desc" style="color:#8c8c8c;">
                                确认截止：${Utils.formatDate(expireTs, 'MM-DD HH:mm')}（${n.notifyExpireMinutes}分钟内）
                            </div>
                        ` : ''}
                        ${metaExtra}
                        ${fromText}
                        ${toText}
                    </div>
                `;
            }).join('');
        }

        const batchAvailable = DataStore.getAvailableBatchesForVaccine(entry.vaccineName).length > 0;

        content.innerHTML = `
            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item full">
                        <div class="detail-label">疫苗</div>
                        <div class="detail-value">
                            ${Utils.escapeHtml(entry.vaccineName)}
                            ${batchAvailable 
                                ? '<span style="color:#52c41a; font-size:12px; margin-left:8px;">✓ 有库存</span>' 
                                : '<span style="color:#ff4d4f; font-size:12px; margin-left:8px;">⚠️ 无库存</span>'}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">候补日期</div>
                        <div class="detail-value">${entry.date}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">排队位置</div>
                        <div class="detail-value">#${entry.rank}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">状态</div>
                        <div class="detail-value"><span class="${statusInfo.class}" style="padding:2px 8px; border-radius:4px; font-size:12px;">${statusInfo.text}</span></div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">宠物</div>
                        <div class="detail-value">${Utils.getPetEmoji(entry.petType)} ${Utils.escapeHtml(entry.petName)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">宠主</div>
                        <div class="detail-value">${Utils.escapeHtml(entry.ownerName)}</div>
                    </div>
                    <div class="detail-item full">
                        <div class="detail-label">手机号</div>
                        <div class="detail-value">${Utils.maskPhone(entry.ownerPhone)}</div>
                    </div>
                    ${entry.remark ? `
                    <div class="detail-item full">
                        <div class="detail-label">备注</div>
                        <div class="detail-value">${Utils.escapeHtml(entry.remark)}</div>
                    </div>
                    ` : ''}
                    ${entry.assignedSlot ? `
                    <div class="detail-item full">
                        <div class="detail-label">已分配时段</div>
                        <div class="detail-value" style="color:#1677ff; font-weight:500;">${entry.assignedSlot}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">补位通知记录</div>
                <div class="detail-item-list">
                    ${notifHtml}
                </div>
            </div>

            ${entry.status === 'waiting' ? `
                <div class="action-group">
                    <button class="btn btn-outline btn-block" style="color: #ff4d4f;" onclick="WaitlistModule.cancelWaitlist('${entry.id}')">
                        取消候补
                    </button>
                </div>
            ` : ''}

            ${entry.status === 'notified' ? `
                <div class="action-group">
                    <button class="btn btn-primary btn-block" onclick="WaitlistModule.confirmWaitlist('${entry.id}')">
                        ✓ 确认补位（生成预约）
                    </button>
                    <button class="btn btn-outline btn-block" style="margin-top: 8px;" onclick="WaitlistModule.skipWaitlist('${entry.id}')">
                        跳过，通知下一位
                    </button>
                </div>
            ` : ''}
        `;

        document.getElementById('waitlistDetailDrawer').classList.add('active');
    },

    closeDetailDrawer() {
        this.currentDetailWaitlistId = null;
        document.getElementById('waitlistDetailDrawer').classList.remove('active');
    },

    confirmWaitlist(entryId) {
        const entry = DataStore.data.waitlistEntries.find(w => w.id === entryId);
        if (!entry) return;

        const availableBatches = DataStore.getAvailableBatchesForVaccine(entry.vaccineName);
        if (availableBatches.length === 0) {
            Utils.showToast('⚠️ 该疫苗暂无可用批次库存，无法生成预约', 'error', 3000);
            return;
        }

        const result = DataStore.confirmWaitlistEntry(entryId);

        if (result.success) {
            Utils.showToast(`补位成功，已生成预约（${result.data.timeSlot}）`, 'success', 2500);
            this.closeDetailDrawer();
            this.render();
            ScheduleModule.render();
            BatchModule.render();
            App.updateDashboardStats();
        } else {
            if (result.type === 'no_stock') {
                Utils.showToast('⚠️ 无可用疫苗库存，请等待补货', 'error', 3000);
            } else if (result.type === 'slot_full') {
                Utils.showToast('⚠️ 时段已满员，无法补位', 'error', 2500);
            } else {
                Utils.showToast(result.message || '补位失败', 'error');
            }
        }
    },

    skipWaitlist(entryId) {
        const entry = DataStore.data.waitlistEntries.find(w => w.id === entryId);
        if (!entry) return;

        const result = DataStore.skipWaitlistEntry(entryId);
        if (result) {
            Utils.showToast('已跳过，正在通知下一位', 'success');
            this.closeDetailDrawer();
            this.render();
            ScheduleModule.render();
            App.updateDashboardStats();
        } else {
            Utils.showToast('操作失败', 'error');
        }
    },

    cancelWaitlist(entryId) {
        if (!confirm('确定取消该候补登记吗？')) return;

        DataStore.cancelWaitlistEntry(entryId);
        Utils.showToast('已取消候补', 'success');
        this.closeDetailDrawer();
        this.render();
        App.updateDashboardStats();
    },

    renderNotificationList() {
        const container = document.getElementById('notifyList');
        const notifications = DataStore.data.waitlistNotifications
            .sort((a, b) => new Date(b.notifiedAt || b.createdAt) - new Date(a.notifiedAt || a.createdAt));

        if (notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="background: #fff; border-radius: 12px;">
                    暂无补位通知记录
                </div>
            `;
            return;
        }

        container.innerHTML = notifications.map(n => {
            const entry = DataStore.data.waitlistEntries.find(w => w.id === n.waitlistId);
            const statusDisplay = this.getNotifStatusDisplay(n.status);
            const causeLabel = this.getNotifCauseDisplay(n.reason);
            const expireTs = n.notifiedAt ? new Date(new Date(n.notifiedAt).getTime() + (n.notifyExpireMinutes || 15) * 60000) : null;

            let fromText = '';
            if (n.expiredBy) {
                const prevEntry = DataStore.data.waitlistEntries.find(w => w.id === n.expiredBy);
                if (prevEntry) {
                    fromText = `<div style="margin-top:6px; padding:6px 10px; background:#fff1f0; border-radius:6px; font-size:12px; color:#ff4d4f;">
                        ⬆️ 上一位：${Utils.escapeHtml(prevEntry.petName)} 超时顺延
                    </div>`;
                }
            }

            let toText = '';
            if (n.followedBy) {
                const nextEntry = DataStore.data.waitlistEntries.find(w => w.id === n.followedBy);
                if (nextEntry) {
                    toText = `<div style="margin-top:6px; padding:6px 10px; background:#fff7e6; border-radius:6px; font-size:12px; color:#fa8c16;">
                        ⬇️ 顺延给：${Utils.escapeHtml(nextEntry.petName)}
                    </div>`;
                }
            }

            let timeInfo = '';
            if (n.status === 'confirmed' && n.confirmedAt) {
                timeInfo = `<div class="record-desc" style="color:#52c41a;">✓ ${Utils.formatDate(n.confirmedAt, 'MM-DD HH:mm')} 已确认</div>`;
            } else if ((n.status === 'timeout' || n.status === 'skipped') && n.expiredAt) {
                timeInfo = `<div class="record-desc" style="color:#ff4d4f;">✗ ${Utils.formatDate(n.expiredAt, 'MM-DD HH:mm')} 已超时</div>`;
            } else if (n.status === 'pending_confirm' && expireTs) {
                const now = new Date();
                const remainMs = expireTs - now.getTime();
                if (remainMs > 0) {
                    const min = Math.ceil(remainMs / 60000);
                    timeInfo = `<div class="record-desc" style="color:#ff4d4f;">⏳ 还有${min}分钟截止</div>`;
                }
            }

            return `
                <div class="record-item notification-record-item" data-notif-id="${n.id}" style="background:#fff; border-radius:8px; padding:12px 14px; margin-bottom:8px; box-shadow:0 2px 6px rgba(0,0,0,0.03); cursor:pointer;" onclick="WaitlistModule.jumpToWaitlistFromNotif('${n.waitlistId}')">
                    <div class="record-header">
                        <span class="record-title">${causeLabel}</span>
                        <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${statusDisplay.color}15; color:${statusDisplay.color};">${statusDisplay.text}</span>
                    </div>
                    <div class="record-desc" style="margin-top:4px;">
                        ${entry ? `${Utils.getPetEmoji(entry.petType)} ${Utils.escapeHtml(entry.petName)} · ${Utils.escapeHtml(entry.vaccineName)}` : '候补记录'}
                    </div>
                    <div class="record-desc">
                        补位：${n.date} ${n.timeSlot || '-'}
                    </div>
                    <div class="record-desc" style="color:#8c8c8c;">
                        通知时间：${Utils.formatDate(n.notifiedAt || n.createdAt, 'MM-DD HH:mm')}
                        ${expireTs ? ` · 截止：${Utils.formatDate(expireTs, 'HH:mm')}` : ''}
                    </div>
                    ${timeInfo}
                    ${fromText}
                    ${toText}
                </div>
            `;
        }).join('');
    },

    jumpToWaitlistFromNotif(entryId) {
        const tab = document.querySelector('#page-waitlist .tab-item[data-tab="waitlist-queue"]');
        if (tab) tab.click();
        setTimeout(() => {
            this.showDetail(entryId);
        }, 150);
    },
};