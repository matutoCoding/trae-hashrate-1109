const WaitlistModule = {
    currentDate: '',

    init() {
        this.currentDate = Utils.getTodayStr();
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.querySelectorAll('#page-waitlist .tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#page-waitlist .tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.querySelectorAll('#page-waitlist .tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById('tab-' + target).classList.add('active');
            });
        });

        document.getElementById('waitlistDateFilter').addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.renderWaitlist();
        });

        document.getElementById('addWaitlistBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('closeAddWaitlist').addEventListener('click', () => this.closeAddModal());
        document.getElementById('cancelAddWaitlist').addEventListener('click', () => this.closeAddModal());
        document.getElementById('confirmAddWaitlist').addEventListener('click', () => this.handleAddWaitlist());
    },

    render() {
        this.renderDateFilterOptions();
        this.renderWaitlist();
        this.renderNotifyList();
    },

    renderDateFilterOptions() {
        const select = document.getElementById('waitlistDateFilter');
        const options = [];
        for (let i = 0; i < 7; i++) {
            const dateStr = Utils.getDateStr(i);
            const label = i === 0 ? `今天 (${dateStr.slice(5)})` :
                         i === 1 ? `明天 (${dateStr.slice(5)})` :
                         `${['周日','周一','周二','周三','周四','周五','周六'][new Date(dateStr).getDay()]} (${dateStr.slice(5)})`;
            options.push(`<option value="${dateStr}" ${dateStr === this.currentDate ? 'selected' : ''}>${label}</option>`);
        }
        select.innerHTML = options.join('');
    },

    renderWaitlist() {
        this.renderWaitlistStats();
        this.renderWaitlistItems();
    },

    renderWaitlistStats() {
        const entries = DataStore.getWaitlistByDate(this.currentDate);
        const waiting = entries.filter(e => e.status === 'waiting').length;
        const notified = entries.filter(e => e.status === 'notified').length;
        const confirmed = entries.filter(e => e.status === 'confirmed').length;

        const container = document.getElementById('waitlistStats');
        container.innerHTML = `
            <div class="waitlist-stat-card">
                <div class="waitlist-stat-num">${entries.length}</div>
                <div class="waitlist-stat-label">总候补数</div>
            </div>
            <div class="waitlist-stat-card">
                <div class="waitlist-stat-num" style="color: #52c41a;">${confirmed}</div>
                <div class="waitlist-stat-label">已确认补位</div>
            </div>
            <div class="waitlist-stat-card">
                <div class="waitlist-stat-num" style="color: #fa8c16;">${waiting + notified}</div>
                <div class="waitlist-stat-label">等待中</div>
            </div>
        `;
    },

    renderWaitlistItems() {
        const container = document.getElementById('waitlistList');
        const entries = DataStore.getWaitlistByDate(this.currentDate);

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="background: #fff; border-radius: 12px;">
                    ${Utils.isToday(this.currentDate) ? '今天' : this.currentDate}暂无候补记录
                </div>
            `;
            return;
        }

        container.innerHTML = entries.map(entry => {
            const status = Utils.getWaitlistStatus(entry.status);
            const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : '';
            const preferredText = entry.preferredSlots && entry.preferredSlots.length > 0 
                ? `期望时段：${entry.preferredSlots.join('、')}` 
                : '期望时段：全天可约';

            let actionHtml = '';
            if (entry.status === 'notified') {
                actionHtml = `
                    <div class="waitlist-action">
                        <button class="btn btn-primary btn-sm" onclick="WaitlistModule.confirmEntry('${entry.id}')">确认补位</button>
                    </div>
                `;
            } else if (entry.status === 'waiting') {
                actionHtml = `
                    <div class="waitlist-action">
                        <button class="btn btn-default btn-sm" onclick="WaitlistModule.cancelEntry('${entry.id}')">取消</button>
                    </div>
                `;
            }

            return `
                <div class="waitlist-item">
                    <div class="waitlist-rank ${rankClass}">${entry.rank}</div>
                    <div class="waitlist-info">
                        <div class="waitlist-main">
                            <span class="waitlist-pet">${Utils.getPetEmoji(entry.petType)} ${Utils.escapeHtml(entry.petName)}</span>
                            <span class="waitlist-vaccine">${Utils.escapeHtml(entry.vaccineName)}</span>
                        </div>
                        <div class="waitlist-desc">
                            ${Utils.escapeHtml(entry.ownerName)} · ${Utils.maskPhone(entry.ownerPhone)}
                        </div>
                        <div class="waitlist-desc" style="margin-top: 2px;">
                            ${preferredText}
                            ${entry.assignedSlot ? ` → <span style="color:#1677ff;font-weight:500;">已匹配:${entry.assignedSlot}</span>` : ''}
                        </div>
                        ${entry.notifiedAt ? `
                        <div class="waitlist-desc" style="color: #1677ff; margin-top: 2px;">
                            📨 补位通知于 ${Utils.formatDate(entry.notifiedAt, 'HH:mm')} 推送
                        </div>
                        ` : ''}
                    </div>
                    <span class="waitlist-status-tag ${status.class}">${status.text}</span>
                    ${actionHtml}
                </div>
            `;
        }).join('');
    },

    renderNotifyList() {
        const container = document.getElementById('notifyList');
        const notifyRecords = [];

        DataStore.data.notifications.filter(n => n.type === 'waitlist').forEach(n => {
            notifyRecords.push({
                id: n.id,
                type: 'waitlist',
                title: '补位通知',
                content: n.content,
                time: n.createdAt,
                status: n.read ? 'success' : 'pending'
            });
        });

        DataStore.data.waitlistEntries.filter(e => e.status === 'confirmed' && e.confirmedAt).forEach(e => {
            notifyRecords.push({
                id: `confirm-${e.id}`,
                type: 'confirm',
                title: '补位确认',
                content: `${e.petName}（宠主：${e.ownerName}）已确认补位至 ${e.date} ${e.assignedSlot || '指定时段'}，预约已生成。`,
                time: e.confirmedAt,
                status: 'success'
            });
        });

        notifyRecords.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (notifyRecords.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="background: #fff; border-radius: 12px;">
                    暂无补位通知记录
                </div>
            `;
            return;
        }

        container.innerHTML = notifyRecords.slice(0, 50).map(r => {
            const iconMap = {
                waitlist: { icon: '🔔', name: '补位推送' },
                confirm: { icon: '✅', name: '补位确认' }
            };
            const info = iconMap[r.type] || { icon: '📨', name: '通知' };
            const statusClass = r.status === 'success' ? 'notify-success' : (r.status === 'pending' ? 'notify-pending' : 'notify-failed');
            const statusMap = {
                success: { text: '成功', class: 'success' },
                pending: { text: '待确认', class: '' },
                failed: { text: '失败', class: 'expired' }
            };
            const s = statusMap[r.status] || statusMap.success;

            return `
                <div class="notify-card ${statusClass}">
                    <div class="notify-header">
                        <span class="notify-type">
                            ${info.icon} ${info.name}
                        </span>
                        <span class="notify-status status-${s.class}">${s.text}</span>
                    </div>
                    <div class="notify-content">${Utils.escapeHtml(r.content)}</div>
                    <div class="notify-meta">
                        <span>${Utils.formatDate(r.time, 'YYYY-MM-DD HH:mm')}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    openAddModal() {
        const form = document.getElementById('addWaitlistForm');
        form.reset();
        form.waitlistDate.value = this.currentDate;
        this.renderTimeSlotCheckboxes();
        this.renderVaccineSelectOptions();
        document.getElementById('addWaitlistModal').classList.add('active');
    },

    closeAddModal() {
        document.getElementById('addWaitlistModal').classList.remove('active');
    },

    renderTimeSlotCheckboxes() {
        const container = document.getElementById('waitlistTimeSlots');
        const slots = Utils.generateTimeSlots();
        container.innerHTML = slots.map(s => `
            <label class="checkbox-item" onclick="this.classList.toggle('checked'); this.querySelector('input').checked = !this.querySelector('input').checked;">
                <input type="checkbox" name="preferredSlots" value="${s}">
                <span>${s}</span>
            </label>
        `).join('');
    },

    renderVaccineSelectOptions() {
        const select = document.getElementById('waitlistVaccine');
        const vaccineTypes = [...new Set(DataStore.data.vaccineBatches.map(b => b.vaccineName))];
        select.innerHTML = '<option value="">请选择疫苗</option>' +
            vaccineTypes.map(v => `<option value="${v}">${v}</option>`).join('');
    },

    handleAddWaitlist() {
        const form = document.getElementById('addWaitlistForm');
        const date = form.waitlistDate.value;
        const petName = form.waitlistPetName.value.trim();
        const petType = form.waitlistPetType.value;
        const ownerName = form.waitlistOwnerName.value.trim();
        const ownerPhone = form.waitlistOwnerPhone.value.trim();
        const vaccineName = form.waitlistVaccine.value;
        const expiryDays = parseInt(form.waitlistExpire.value);

        const preferredChecks = form.querySelectorAll('input[name="preferredSlots"]:checked');
        const preferredSlots = Array.from(preferredChecks).map(c => c.value);

        if (!date) { Utils.showToast('请选择候补日期', 'error'); return; }
        if (!petName) { Utils.showToast('请输入宠物昵称', 'error'); return; }
        if (!ownerName) { Utils.showToast('请输入宠主姓名', 'error'); return; }
        if (!ownerPhone) { Utils.showToast('请输入联系电话', 'error'); return; }
        if (!Utils.validatePhone(ownerPhone)) { Utils.showToast('请输入正确的手机号', 'error'); return; }
        if (!vaccineName) { Utils.showToast('请选择接种疫苗', 'error'); return; }

        const entry = DataStore.addWaitlistEntry({
            date,
            preferredSlots,
            petName,
            petType,
            ownerName,
            ownerPhone,
            vaccineName,
            expiryDays
        });

        DataStore.addNotification({
            type: 'system',
            title: '候补登记成功',
            content: `${ownerName}的${petName}已加入${date}候补队列，当前排名第${entry.rank}位，有空闲时段将自动通知。`
        });

        Utils.showToast(`候补成功，当前排名第${entry.rank}位`, 'success');
        this.closeAddModal();
        this.render();
        App.updateDashboardStats();
    },

    confirmEntry(entryId) {
        const success = DataStore.confirmWaitlistEntry(entryId);
        if (success) {
            Utils.showToast('补位已确认，预约已生成', 'success');
            this.render();
            ScheduleModule.render();
            App.updateDashboardStats();
        } else {
            Utils.showToast('确认失败，请刷新后重试', 'error');
        }
    },

    cancelEntry(entryId) {
        if (!confirm('确定取消该候补登记吗？')) return;

        const entry = DataStore.data.waitlistEntries.find(e => e.id === entryId);
        if (entry) {
            DataStore.data.waitlistEntries
                .filter(e => e.date === entry.date && e.rank > entry.rank && e.status === 'waiting')
                .forEach(e => e.rank--);

            DataStore.data.waitlistEntries = DataStore.data.waitlistEntries.filter(e => e.id !== entryId);
            DataStore.save();

            Utils.showToast('已取消候补', 'success');
            this.render();
            App.updateDashboardStats();
        }
    },

    simulateAutoFill() {
        const today = Utils.getTodayStr();
        const slots = DataStore.data.timeSlots[today] || [];
        const fullSlots = slots.filter(s => s.booked >= s.capacity);
        if (fullSlots.length === 0) {
            Utils.showToast('当前没有约满的时段', 'info');
            return;
        }

        const targetSlot = fullSlots[0];
        const appointments = DataStore.getAppointmentsBySlot(today, targetSlot.time);
        if (appointments.length === 0) return;

        const apt = appointments[0];
        if (apt.status === 'confirmed') {
            apt.status = 'timeout';
            apt.timeoutMinutes = 35;
            const filled = DataStore.tryFillFromWaitlist(today, targetSlot.time);
            DataStore.recalculateSlotBookings();
            DataStore.save();

            if (filled) {
                Utils.showToast(`模拟超时：${apt.timeSlot}释放，候补第${filled.rank}位${filled.petName}已通知补位`, 'success');
            } else {
                Utils.showToast(`模拟超时：${apt.timeSlot}释放，但暂无可候补人员`, 'info');
            }
            this.render();
            ScheduleModule.render();
            App.updateDashboardStats();
        }
    }
};