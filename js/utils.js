const Utils = {
    formatDate(dateStr, format = 'YYYY-MM-DD') {
        const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes);
    },

    formatDateCN(dateStr) {
        const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    },

    getDaysBetween(dateStr1, dateStr2) {
        const d1 = new Date(dateStr1);
        const d2 = new Date(dateStr2);
        return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
    },

    getTodayStr() {
        return new Date().toISOString().split('T')[0];
    },

    getDateStr(offset = 0) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toISOString().split('T')[0];
    },

    isToday(dateStr) {
        return dateStr === this.getTodayStr();
    },

    isPast(dateStr) {
        return dateStr < this.getTodayStr();
    },

    getRelativeDateStr(dateStr) {
        if (this.isToday(dateStr)) return '今天';
        const tomorrow = this.getDateStr(1);
        if (dateStr === tomorrow) return '明天';
        const yesterday = this.getDateStr(-1);
        if (dateStr === yesterday) return '昨天';
        return dateStr;
    },

    getBatchStatus(batch) {
        if (batch.status === 'recalled') return { text: '已召回', class: 'status-recalled' };
        
        const today = new Date();
        const expireDate = new Date(batch.expireDate);
        const daysLeft = Math.ceil((expireDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysLeft < 0) return { text: '已过期', class: 'status-expired' };
        if (daysLeft <= 30) return { text: `${daysLeft}天后过期`, class: 'status-warning' };
        return { text: '正常', class: 'status-normal' };
    },

    getStockPercent(batch) {
        const used = batch.usedQty || 0;
        const total = batch.stockQty || 0;
        if (total === 0) return 0;
        return Math.round((used / total) * 100);
    },

    getStockBarClass(percent) {
        if (percent >= 80) return 'bar-red';
        if (percent >= 50) return 'bar-orange';
        return 'bar-green';
    },

    getAppointmentStatus(status) {
        const map = {
            confirmed: { text: '已确认', class: 'tag-confirmed' },
            timeout: { text: '超时未到', class: 'tag-timeout' },
            completed: { text: '已完成', class: 'tag-completed' },
            cancelled: { text: '已取消', class: 'tag-cancelled' }
        };
        return map[status] || { text: status, class: 'tag-cancelled' };
    },

    getWaitlistStatus(status) {
        const map = {
            waiting: { text: '候补中', class: 'status-waiting' },
            notified: { text: '已通知补位', class: 'status-notified' },
            confirmed: { text: '已确认', class: 'status-confirmed' },
            expired: { text: '已过期', class: 'status-expired' }
        };
        return map[status] || { text: status, class: 'status-expired' };
    },

    getRecallLevel(level) {
        const map = {
            high: { text: '紧急', class: 'level-high' },
            medium: { text: '重要', class: 'level-medium' },
            low: { text: '一般', class: 'level-low' }
        };
        return map[level] || { text: '一般', class: 'level-low' };
    },

    getTimeSlotPeriod(time) {
        const hour = parseInt(time.split(':')[0]);
        if (hour < 12) return { name: '上午', class: 'morning' };
        return { name: '下午', class: 'afternoon' };
    },

    getNotificationTypeInfo(type) {
        const map = {
            recall: { icon: '⚠️', name: '召回通知' },
            timeout: { icon: '⏰', name: '超时提醒' },
            waitlist: { icon: '🔔', name: '补位通知' },
            expiry: { icon: '📅', name: '效期预警' },
            system: { icon: '📢', name: '系统通知' }
        };
        return map[type] || { icon: '📢', name: '通知' };
    },

    maskPhone(phone) {
        if (!phone || phone.length < 7) return phone;
        return phone.slice(0, 3) + '****' + phone.slice(-4);
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    },

    getPetEmoji(type) {
        const map = {
            '犬': '🐕',
            '狗': '🐕',
            '猫': '🐱',
            '喵': '🐱',
            '兔': '🐰'
        };
        return map[type] || '🐾';
    },

    showToast(message, type = 'info', duration = 2000) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast show toast-${type}`;
        
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.className = 'toast';
        }, duration);
    },

    debounce(fn, delay = 300) {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    validatePhone(phone) {
        return /^1[3-9]\d{9}$/.test(phone);
    },

    generateTimeSlots() {
        const slots = [];
        for (let h = 9; h < 12; h++) {
            for (let m = 0; m < 60; m += 30) {
                const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const endH = m === 30 ? h + 1 : h;
                const endM = m === 30 ? 0 : 30;
                const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                slots.push(`${start}-${end}`);
            }
        }
        for (let h = 14; h < 17; h++) {
            for (let m = 0; m < 60; m += 30) {
                const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const endH = m === 30 ? h + 1 : h;
                const endM = m === 30 ? 0 : 30;
                const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                slots.push(`${start}-${end}`);
            }
        }
        return slots;
    },

    isSlotPassed(timeSlot, dateStr) {
        if (!this.isToday(dateStr)) return false;
        const now = new Date();
        const [startTime] = timeSlot.split('-');
        const [hours, minutes] = startTime.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(hours, minutes, 0, 0);
        return now > slotTime;
    },

    getAvailableBatchCount(vaccineName) {
        return DataStore.getAvailableBatchesForVaccine(vaccineName).length;
    }
};