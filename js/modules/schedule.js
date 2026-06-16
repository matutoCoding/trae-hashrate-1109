const ScheduleModule = {
    currentDate: '',
    expandedSlot: null,

    init() {
        this.currentDate = Utils.getTodayStr();
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('prevDate').addEventListener('click', () => this.changeDate(-1));
        document.getElementById('nextDate').addEventListener('click', () => this.changeDate(1));
        document.getElementById('refreshSchedule').addEventListener('click', () => this.refreshTimeout());

        document.getElementById('addAppointmentBtn').addEventListener('click', () => this.openAddModal());
        document.getElementById('closeAddAppointment').addEventListener('click', () => this.closeAddModal());
        document.getElementById('cancelAddAppointment').addEventListener('click', () => this.closeAddModal());
        document.getElementById('confirmAddAppointment').addEventListener('click', () => this.handleAddAppointment());

        document.getElementById('closeAppointmentDetail').addEventListener('click', () => this.closeDetailModal());
    },

    changeDate(offset) {
        const d = new Date(this.currentDate);
        d.setDate(d.getDate() + offset);
        this.currentDate = d.toISOString().split('T')[0];
        this.expandedSlot = null;
        this.render();
    },

    setDate(dateStr) {
        this.currentDate = dateStr;
        this.expandedSlot = null;
        this.render();
    },

    refreshTimeout() {
        const count = DataStore.releaseTimeoutAppointments();
        Utils.showToast(count > 0 ? `已释放${count}个超时时段` : '暂无可释放的超时预约', count > 0 ? 'success' : 'info');
        this.render();
        App.updateDashboardStats();
    },

    render() {
        this.renderDateHeader();
        this.renderStats();
        this.renderTimeSlots();
        this.renderSlotSelectOptions();
        this.renderVaccineSelectOptions();
    },

    renderDateHeader() {
        const display = document.getElementById('currentDateDisplay');
        const date = new Date(this.currentDate);
        const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];

        if (Utils.isToday(this.currentDate)) {
            display.innerHTML = `今天 · ${this.currentDate.slice(5)} ${weekday}`;
        } else {
            display.innerHTML = `${Utils.formatDateCN(this.currentDate)} ${weekday}`;
        }
    },

    renderStats() {
        const slots = DataStore.data.timeSlots[this.currentDate] || [];
        const appointments = DataStore.getAppointmentsByDate(this.currentDate);

        const total = slots.reduce((sum, s) => sum + s.capacity, 0);
        const booked = slots.reduce((sum, s) => sum + s.booked, 0);
        const timeout = appointments.filter(a => a.status === 'timeout').length;
        const available = total - booked;

        document.getElementById('scheduleTotal').textContent = total;
        document.getElementById('scheduleBooked').textContent = booked;
        document.getElementById('scheduleAvailable').textContent = Math.max(0, available);
        document.getElementById('scheduleTimeout').textContent = timeout;
    },

    renderTimeSlots() {
        const container = document.getElementById('timeSlotList');
        const slots = DataStore.data.timeSlots[this.currentDate] || [];

        if (slots.length === 0) {
            container.innerHTML = `<div class="empty-tip">该日期暂无可预约时段</div>`;
            return;
        }

        const morningSlots = slots.filter(s => s.period === 'morning');
        const afternoonSlots = slots.filter(s => s.period === 'afternoon');

        let html = '';
        if (morningSlots.length > 0) {
            html += this.renderSlotGroup('上午', morningSlots);
        }
        if (afternoonSlots.length > 0) {
            html += this.renderSlotGroup('下午', afternoonSlots);
        }

        container.innerHTML = html;

        container.querySelectorAll('.time-slot-item').forEach(item => {
            item.addEventListener('click', () => {
                const time = item.dataset.time;
                this.toggleSlotExpand(time);
            });
        });

        container.querySelectorAll('.appointment-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const aptId = card.dataset.aptId;
                this.showAppointmentDetail(aptId);
            });
        });
    },

    renderSlotGroup(title, slots) {
        const now = new Date();
        let html = `
            <div class="time-slot-group">
                <div class="time-slot-group-header">
                    <span>${title}</span>
                    <span style="color: #999; font-weight: normal;">
                        ${slots.filter(s => s.booked < s.capacity).length}个时段可约
                    </span>
                </div>
                <div class="time-slot-grid">
                    ${slots.map(slot => {
                        const isPassed = Utils.isSlotPassed(slot.time, this.currentDate);
                        const isFull = slot.booked >= slot.capacity;
                        
                        const now = new Date();
                        const [startTime] = slot.time.split('-');
                        const [h, m] = startTime.split(':').map(Number);
                        const slotDate = new Date(this.currentDate);
                        slotDate.setHours(h, m, 0, 0);
                        const diffMinutes = (now - slotDate) / (1000 * 60);
                        const hasTimeout = Utils.isToday(this.currentDate) && 
                            diffMinutes > 30 && diffMinutes < 120 && slot.booked > 0;

                        let slotClass = 'slot-available';
                        if (isPassed) slotClass = 'slot-passed';
                        else if (hasTimeout) slotClass = 'slot-timeout';
                        else if (isFull) slotClass = 'slot-full';
                        else if (slot.booked > 0) slotClass = 'slot-booked';

                        const isExpanded = this.expandedSlot === slot.time;
                        const badgeHtml = slot.booked > 0 ? `<span class="slot-badge">${slot.booked}</span>` : '';

                        return `
                            <div class="time-slot-item ${slotClass}" data-time="${slot.time}">
                                <div class="slot-time">${slot.time}</div>
                                <div class="slot-capacity">${slot.booked}/${slot.capacity}</div>
                                ${badgeHtml}
                            </div>
                            ${isExpanded ? this.renderSlotAppointments(slot.time) : ''}
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        return html;
    },

    renderSlotAppointments(timeSlot) {
        const appointments = DataStore.getAppointmentsBySlot(this.currentDate, timeSlot);
        if (appointments.length === 0) return '';

        return `
            <div class="appointment-list" onclick="event.stopPropagation()">
                ${appointments.map(apt => {
                    const status = Utils.getAppointmentStatus(apt.status);
                    return `
                        <div class="appointment-card ${apt.status === 'timeout' ? 'status-timeout' : ''}" data-apt-id="${apt.id}">
                            <div class="appointment-avatar">${Utils.getPetEmoji(apt.petType)}</div>
                            <div class="appointment-info">
                                <div class="appointment-pet">
                                    ${Utils.escapeHtml(apt.petName)}
                                    <span style="font-size: 11px; color: #999; font-weight: normal; margin-left: 6px;">
                                        ${Utils.escapeHtml(apt.petType)}
                                    </span>
                                </div>
                                <div class="appointment-detail">
                                    ${Utils.escapeHtml(apt.ownerName)} · ${Utils.escapeHtml(apt.vaccineName)}
                                </div>
                                ${apt.timeoutMinutes ? `<div style="font-size: 11px; color: #fa8c16; margin-top: 2px;">超时 ${apt.timeoutMinutes} 分钟</div>` : ''}
                            </div>
                            <span class="appointment-tag ${status.class}">${status.text}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    toggleSlotExpand(time) {
        if (this.expandedSlot === time) {
            this.expandedSlot = null;
        } else {
            this.expandedSlot = time;
        }
        this.renderTimeSlots();
    },

    renderSlotSelectOptions() {
        const select = document.getElementById('appointmentTimeSlot');
        if (!select) return;

        const slots = DataStore.data.timeSlots[this.currentDate] || [];
        const availableSlots = slots.filter(s => s.booked < s.capacity);

        select.innerHTML = '<option value="">请选择时段</option>' +
            availableSlots.map(s => `<option value="${s.time}">${s.time}（剩${s.capacity - s.booked}位）</option>`).join('');
    },

    renderVaccineSelectOptions() {
        const select = document.getElementById('appointmentVaccine');
        if (!select) return;

        const vaccineTypes = [...new Set(DataStore.data.vaccineBatches
            .filter(b => b.status === 'normal' && b.stockQty > (b.usedQty || 0))
            .map(b => b.vaccineName))];

        select.innerHTML = '<option value="">请选择疫苗（将自动分配批次）</option>' +
            vaccineTypes.map(v => {
                const availableBatches = DataStore.getAvailableBatchesForVaccine(v).length;
                return `<option value="${v}">${v}（${availableBatches}个批次可用）</option>`;
            }).join('');
    },

    openAddModal() {
        document.getElementById('addAppointmentForm').reset();
        this.renderSlotSelectOptions();
        this.renderVaccineSelectOptions();
        document.getElementById('addAppointmentModal').classList.add('active');
    },

    closeAddModal() {
        document.getElementById('addAppointmentModal').classList.remove('active');
    },

    handleAddAppointment() {
        const form = document.getElementById('addAppointmentForm');
        const timeSlot = form.appointmentTimeSlot.value;
        const petName = form.petName.value.trim();
        const petType = form.petType.value;
        const ownerName = form.ownerName.value.trim();
        const ownerPhone = form.ownerPhone.value.trim();
        const vaccineName = form.appointmentVaccine.value;
        const remark = form.appointmentRemark.value.trim();

        if (!timeSlot) { Utils.showToast('请选择预约时段', 'error'); return; }
        if (!petName) { Utils.showToast('请输入宠物昵称', 'error'); return; }
        if (!ownerName) { Utils.showToast('请输入宠主姓名', 'error'); return; }
        if (!ownerPhone) { Utils.showToast('请输入联系电话', 'error'); return; }
        if (!Utils.validatePhone(ownerPhone)) { Utils.showToast('请输入正确的手机号', 'error'); return; }
        if (!vaccineName) { Utils.showToast('请选择接种疫苗', 'error'); return; }

        const slots = DataStore.data.timeSlots[this.currentDate] || [];
        const slot = slots.find(s => s.time === timeSlot);
        if (slot && slot.booked >= slot.capacity) {
            Utils.showToast('该时段已约满，建议加入候补', 'error');
            return;
        }

        const availableBatches = DataStore.getAvailableBatchesForVaccine(vaccineName);
        if (availableBatches.length === 0) {
            Utils.showToast('该疫苗暂无可用批次', 'error');
            return;
        }
        const assignedBatch = availableBatches[0];

        const appointment = DataStore.addAppointment({
            date: this.currentDate,
            timeSlot,
            petName,
            petType,
            ownerName,
            ownerPhone,
            vaccineName,
            vaccineBatchId: assignedBatch.id,
            remark
        });

        DataStore.addNotification({
            type: 'system',
            title: '预约成功',
            content: `${ownerName}的${petName}已成功预约${this.currentDate} ${timeSlot}的${vaccineName}接种（批次：${assignedBatch.batchNo}）`
        });

        Utils.showToast('预约成功', 'success');
        this.closeAddModal();
        this.render();
        App.updateDashboardStats();
    },

    showAppointmentDetail(appointmentId) {
        const apt = DataStore.data.appointments.find(a => a.id === appointmentId);
        if (!apt) return;

        const status = Utils.getAppointmentStatus(apt.status);
        const batch = apt.vaccineBatchId ? DataStore.getBatch(apt.vaccineBatchId) : null;

        const content = document.getElementById('appointmentDetailContent');
        content.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item full">
                    <div class="detail-label">预约状态</div>
                    <div class="detail-value"><span class="appointment-tag ${status.class}">${status.text}</span></div>
                </div>
                <div class="detail-item full">
                    <div class="detail-label">预约时间</div>
                    <div class="detail-value" style="font-size: 16px; font-weight: 600;">
                        ${Utils.formatDateCN(apt.date)} ${apt.timeSlot}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">宠物昵称</div>
                    <div class="detail-value">
                        ${Utils.getPetEmoji(apt.petType)} ${Utils.escapeHtml(apt.petName)}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">宠物类型</div>
                    <div class="detail-value">${Utils.escapeHtml(apt.petType)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">宠主姓名</div>
                    <div class="detail-value">${Utils.escapeHtml(apt.ownerName)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">联系电话</div>
                    <div class="detail-value">${Utils.maskPhone(apt.ownerPhone)}</div>
                </div>
                <div class="detail-item full">
                    <div class="detail-label">接种疫苗</div>
                    <div class="detail-value">${Utils.escapeHtml(apt.vaccineName)}</div>
                </div>
                ${batch ? `
                <div class="detail-item full">
                    <div class="detail-label">分配批次</div>
                    <div class="detail-value" style="font-family: 'Courier New', monospace; font-size: 13px;">
                        ${Utils.escapeHtml(batch.batchNo)}
                        <span style="font-size: 12px; color: #999; margin-left: 8px;">
                            ${batch.manufacturer || ''} · 有效期至 ${batch.expireDate}
                        </span>
                    </div>
                </div>
                ` : ''}
                ${apt.remark ? `
                <div class="detail-item full">
                    <div class="detail-label">备注</div>
                    <div class="detail-value">${Utils.escapeHtml(apt.remark)}</div>
                </div>
                ` : ''}
                ${apt.timeoutMinutes ? `
                <div class="detail-item full">
                    <div class="detail-label">超时情况</div>
                    <div class="detail-value highlight">已超时 ${apt.timeoutMinutes} 分钟</div>
                </div>
                ` : ''}
                ${apt.checkedInAt ? `
                <div class="detail-item full">
                    <div class="detail-label">签到时间</div>
                    <div class="detail-value success">${Utils.formatDate(apt.checkedInAt, 'YYYY-MM-DD HH:mm')}</div>
                </div>
                ` : ''}
                <div class="detail-item full">
                    <div class="detail-label">预约创建时间</div>
                    <div class="detail-value">${Utils.formatDate(apt.createdAt, 'YYYY-MM-DD HH:mm')}</div>
                </div>
            </div>
        `;

        const footer = document.getElementById('appointmentDetailFooter');
        let footerHtml = '';

        if (apt.status === 'confirmed' || apt.status === 'timeout') {
            footerHtml += `<button class="btn btn-primary" id="btnCheckIn">✓ 完成接种签到</button>`;
        }
        if (apt.status === 'confirmed') {
            footerHtml += `<button class="btn btn-default" id="btnCancelApt">取消预约</button>`;
        }

        footer.innerHTML = footerHtml;

        if (document.getElementById('btnCheckIn')) {
            document.getElementById('btnCheckIn').addEventListener('click', () => {
                DataStore.checkInAppointment(appointmentId);
                Utils.showToast('已完成接种登记', 'success');
                this.closeDetailModal();
                this.render();
                BatchModule.render();
                App.updateDashboardStats();
            });
        }
        if (document.getElementById('btnCancelApt')) {
            document.getElementById('btnCancelApt').addEventListener('click', () => {
                if (confirm('确定取消该预约吗？取消后将通知候补缺位。')) {
                    DataStore.cancelAppointment(appointmentId);
                    Utils.showToast('已取消，候补补位通知已推送', 'success');
                    this.closeDetailModal();
                    this.render();
                    App.updateDashboardStats();
                }
            });
        }

        document.getElementById('appointmentDetailModal').classList.add('active');
    },

    closeDetailModal() {
        document.getElementById('appointmentDetailModal').classList.remove('active');
    }
};