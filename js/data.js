const DataStore = {
    STORAGE_KEY: 'pet_vaccine_app_data',

    defaults: {
        vaccineBatches: [],
        vaccinationRecords: [],
        appointments: [],
        waitlistEntries: [],
        recallRecords: [],
        recallPetStatuses: [],
        stockLedger: [],
        waitlistNotifications: [],
        notifications: [],
        activities: [],
        timeSlots: {}
    },

    data: null,
    autoCheckTimer: null,

    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const savedData = JSON.parse(saved);
                this.data = Object.assign({}, JSON.parse(JSON.stringify(this.defaults)), savedData);
                if (!this.data.recallPetStatuses) this.data.recallPetStatuses = [];
                if (!this.data.stockLedger) this.data.stockLedger = [];
                if (!this.data.waitlistNotifications) this.data.waitlistNotifications = [];
                if (!this.data.notifications) this.data.notifications = [];
                if (!this.data.activities) this.data.activities = [];
                if (!this.data.timeSlots) this.data.timeSlots = {};
                
                this.data.vaccineBatches.forEach(batch => {
                    if (batch.reservedQty === undefined) batch.reservedQty = 0;
                    if (batch.frozenQty === undefined) batch.frozenQty = 0;
                    if (batch.availableQty === undefined) batch.availableQty = batch.stockQty - (batch.usedQty || 0);
                });

                this.data.recallPetStatuses.forEach(ps => {
                    if (ps.reexamAppointmentId === undefined) ps.reexamAppointmentId = null;
                    if (ps.revaccinateAppointmentId === undefined) ps.revaccinateAppointmentId = null;
                    if (ps.revaccinationRecordId === undefined) ps.revaccinationRecordId = null;
                    if (ps.revaccinateBatchId === undefined) ps.revaccinateBatchId = null;
                });

                this.data.vaccinationRecords.forEach(v => {
                    if (v.isRevaccinate === undefined) v.isRevaccinate = false;
                    if (v.fromRecallId === undefined) v.fromRecallId = null;
                    if (v.originalRecordId === undefined) v.originalRecordId = null;
                    if (v.revaccinationRecordId === undefined) v.revaccinationRecordId = null;
                    if (v.revaccinateBatchId === undefined) v.revaccinateBatchId = null;
                });

                this.data.appointments.forEach(a => {
                    if (a.fromRecallId === undefined) a.fromRecallId = null;
                    if (a.recallRecordId === undefined) a.recallRecordId = null;
                    if (a.recallType === undefined) a.recallType = null;
                    if (a.originalRecordId === undefined) a.originalRecordId = null;
                    if (a.waitlistId === undefined) a.waitlistId = null;
                });

                this.data.stockLedger.forEach(l => {
                    if (l.relatedType === undefined) l.relatedType = null;
                });
            } catch (e) {
                this.data = JSON.parse(JSON.stringify(this.defaults));
                this.generateMockData();
            }
        } else {
            this.data = JSON.parse(JSON.stringify(this.defaults));
            this.generateMockData();
        }
        this.ensureTimeSlots();
        this.recalculateSlotBookings();
        this.recalculateAllBatchQty();
        this.save();

        this.startAutoCheck();
    },

    startAutoCheck() {
        if (this.autoCheckTimer) clearInterval(this.autoCheckTimer);
        this.autoCheckTimer = setInterval(() => {
            const released = this.releaseTimeoutAppointments();
            const expiredWaitlist = this.processExpiredWaitlistNotifications();
            if (released > 0 || expiredWaitlist > 0) {
                this.save();
                if (typeof window.onDataAutoChecked === 'function') {
                    window.onDataAutoChecked({ released, expiredWaitlist });
                }
            }
        }, 30000);
    },

    stopAutoCheck() {
        if (this.autoCheckTimer) {
            clearInterval(this.autoCheckTimer);
            this.autoCheckTimer = null;
        }
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    },

    reset() {
        this.data = JSON.parse(JSON.stringify(this.defaults));
        this.generateMockData();
        this.ensureTimeSlots();
        this.save();
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /* ========== 库存台账 ========== */
    STOCK_LEDGER_TYPES: {
        INBOUND: 'inbound',
        APPOINTMENT_RESERVE: 'appointment_reserve',
        APPOINTMENT_CANCEL: 'appointment_cancel',
        VACCINATE_DEDUCT: 'vaccinate_deduct',
        RECALL_FREEZE: 'recall_freeze',
        RECALL_UNFREEZE: 'recall_unfreeze',
        REVACCINATE_ADD: 'revaccinate_add',
        VOID: 'void',
        ADJUST: 'adjust'
    },

    STOCK_LEDGER_TYPE_LABELS: {
        inbound: '入库',
        appointment_reserve: '预约占用',
        appointment_cancel: '预约取消释放',
        vaccinate_deduct: '接种扣减',
        recall_freeze: '召回冻结',
        recall_unfreeze: '召回解冻',
        revaccinate_add: '补种登记',
        void: '作废处理',
        adjust: '库存调整'
    },

    addStockLedger(batchId, type, changeQty, beforeQty, afterQty, remark, relatedId, relatedType) {
        const ledger = {
            id: this.generateId(),
            batchId,
            type,
            typeLabel: this.STOCK_LEDGER_TYPE_LABELS[type] || type,
            changeQty,
            beforeQty,
            afterQty,
            remark: remark || '',
            relatedId: relatedId || null,
            relatedType: relatedType || null,
            createdAt: new Date().toISOString()
        };
        this.data.stockLedger.unshift(ledger);
        return ledger;
    },

    getStockLedgerByBatch(batchId, filters = {}) {
        let list = this.data.stockLedger
            .filter(l => l.batchId === batchId);
        
        if (filters.type) {
            list = list.filter(l => l.type === filters.type);
        }
        if (filters.startDate) {
            const start = new Date(filters.startDate + 'T00:00:00').getTime();
            list = list.filter(l => new Date(l.createdAt).getTime() >= start);
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate + 'T23:59:59').getTime();
            list = list.filter(l => new Date(l.createdAt).getTime() <= end);
        }
        if (filters.keyword && filters.keyword.trim()) {
            const kw = filters.keyword.trim().toLowerCase();
            list = list.filter(l => {
                if (l.remark && l.remark.toLowerCase().includes(kw)) return true;
                if (l.typeLabel && l.typeLabel.toLowerCase().includes(kw)) return true;
                if (l.relatedId && l.relatedId.toLowerCase().includes(kw)) return true;
                const related = this.getRelatedInfo(l.relatedId, l.relatedType);
                if (related) {
                    if (related.title && related.title.toLowerCase().includes(kw)) return true;
                    if (related.subtitle && related.subtitle.toLowerCase().includes(kw)) return true;
                    if (related.petName && related.petName.toLowerCase().includes(kw)) return true;
                    if (related.ownerName && related.ownerName.toLowerCase().includes(kw)) return true;
                    if (related.vaccineName && related.vaccineName.toLowerCase().includes(kw)) return true;
                }
                return false;
            });
        }
        
        return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getStockLedgerForExport(batchId, filters = {}) {
        const ledger = this.getStockLedgerByBatch(batchId, filters);
        const batch = this.getBatch(batchId);
        const summary = this.getStockLedgerSummary(batchId, filters);

        const rows = ledger.map((l, idx) => {
            const related = this.getRelatedInfo(l.relatedId, l.relatedType);
            return {
                序号: idx + 1,
                变动时间: Utils.formatDate(l.createdAt, 'YYYY-MM-DD HH:mm:ss'),
                变动类型: l.typeLabel || l.type,
                变动数量: l.changeQty > 0 ? `+${l.changeQty}` : `${l.changeQty}`,
                变动前: l.beforeQty,
                变动后: l.afterQty,
                备注: l.remark || '',
                关联类型: related ? related.label : (l.relatedType || '-'),
                关联信息: related ? related.title : '-',
                关联时间: related ? (related.subtitle || '-') : '-',
                关联单号: l.relatedId || '-'
            };
        });

        return {
            batch: batch ? {
                疫苗名称: batch.vaccineName,
                批号: batch.batchNo,
                生产厂家: batch.manufacturer || '-',
                有效期至: batch.expireDate,
                总入库量: batch.stockQty,
                已使用: batch.usedQty,
                预约占用: batch.reservedQty,
                召回冻结: batch.frozenQty || 0,
                当前可用: batch.availableQty
            } : {},
            summary: {
                期初余额: summary.startBalance,
                本期入库: summary.totalIn,
                本期出库: summary.totalOut,
                期末余额: summary.endBalance,
                记录条数: summary.recordCount
            },
            rows
        };
    },

    exportStockLedgerToCSV(batchId, filters = {}) {
        const data = this.getStockLedgerForExport(batchId, filters);
        const batch = data.batch;
        const summary = data.summary;
        const rows = data.rows;

        let csv = '\uFEFF';

        csv += '库存台账对账单\n';
        csv += `疫苗名称,${batch.疫苗名称 || ''}\n`;
        csv += `批号,${batch.批号 || ''}\n`;
        csv += `生产厂家,${batch.生产厂家 || ''}\n`;
        csv += `有效期至,${batch.有效期至 || ''}\n`;
        csv += `导出时间,${Utils.formatDate(new Date().toISOString(), 'YYYY-MM-DD HH:mm:ss')}\n`;
        csv += '\n';

        csv += '汇总信息\n';
        csv += `期初余额,${summary.期初余额} 剂\n`;
        csv += `本期入库,+${summary.本期入库} 剂\n`;
        csv += `本期出库,-${summary.本期出库} 剂\n`;
        csv += `期末余额,${summary.期末余额} 剂\n`;
        csv += `记录条数,${summary.记录条数} 条\n`;
        csv += '\n';

        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            csv += headers.join(',') + '\n';
            rows.forEach(row => {
                csv += headers.map(h => {
                    let val = String(row[h] || '');
                    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                        val = '"' + val.replace(/"/g, '""') + '"';
                    }
                    return val;
                }).join(',') + '\n';
            });
        }

        return csv;
    },

    getStockLedgerSummary(batchId, filters = {}) {
        const ledger = this.getStockLedgerByBatch(batchId, filters);
        const summary = {
            totalIn: 0,
            totalOut: 0,
            startBalance: 0,
            endBalance: 0,
            inboundCount: 0,
            outboundCount: 0,
            adjustCount: 0
        };

        if (ledger.length > 0) {
            const sorted = [...ledger].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            summary.startBalance = sorted[0].beforeQty;
            summary.endBalance = sorted[sorted.length - 1].afterQty;
        }

        ledger.forEach(l => {
            if (l.changeQty > 0) {
                summary.totalIn += l.changeQty;
                summary.inboundCount++;
            } else if (l.changeQty < 0) {
                summary.totalOut += Math.abs(l.changeQty);
                summary.outboundCount++;
            } else {
                summary.adjustCount++;
            }
        });

        summary.recordCount = ledger.length;
        return summary;
    },

    getRelatedInfo(relatedId, relatedType) {
        if (!relatedId) return null;
        if (relatedType === 'appointment' || (!relatedType && relatedId)) {
            const apt = this.data.appointments.find(a => a.id === relatedId);
            if (apt) {
                return {
                    type: 'appointment',
                    label: '预约',
                    id: apt.id,
                    title: `${apt.petName} · ${apt.vaccineName}`,
                    subtitle: `${apt.date} ${apt.timeSlot}`,
                    petName: apt.petName,
                    ownerName: apt.ownerName,
                    vaccineName: apt.vaccineName
                };
            }
        }
        if (relatedType === 'recall' || (!relatedType && relatedId)) {
            const r = this.data.recallRecords.find(x => x.id === relatedId);
            if (r) {
                return {
                    type: 'recall',
                    label: '召回',
                    id: r.id,
                    title: `${r.vaccineName} · ${r.reason}`,
                    subtitle: `批次 ${r.batchNo}`,
                    vaccineName: r.vaccineName,
                    batchNo: r.batchNo
                };
            }
        }
        if (relatedType === 'vaccination' || (!relatedType && relatedId)) {
            const v = this.data.vaccinationRecords.find(x => x.id === relatedId);
            if (v) {
                return {
                    type: 'vaccination',
                    label: '接种',
                    id: v.id,
                    title: `${v.petName} · ${v.vaccineName}`,
                    subtitle: `${v.vaccinationDate} ${v.vaccinationTime}`,
                    petName: v.petName,
                    ownerName: v.ownerName,
                    vaccineName: v.vaccineName
                };
            }
        }
        return null;
    },

    /* ========== 召回宠物进度 ========== */
    RECALL_PET_STATUS: {
        NOTIFIED: 'notified',
        CONTACTED: 'contacted',
        REEXAMINED: 'reexamined',
        REVACCINATED: 'revaccinated',
        NO_ACTION: 'no_action',
        PENDING: 'pending'
    },

    RECALL_PET_STATUS_LABELS: {
        pending: '待通知',
        notified: '已通知',
        contacted: '已联系',
        reexamined: '已复查',
        revaccinated: '已补种',
        no_action: '无需处理'
    },

    RECALL_PET_STATUS_ORDER: ['pending', 'notified', 'contacted', 'reexamined', 'revaccinated', 'no_action'],

    getRecallPetStatus(recallId, recordId) {
        return this.data.recallPetStatuses.find(s => s.recallId === recallId && s.recordId === recordId);
    },

    setRecallPetStatus(recallId, recordId, status, remark) {
        let existing = this.getRecallPetStatus(recallId, recordId);
        if (!existing) {
            existing = {
                id: this.generateId(),
                recallId,
                recordId,
                status: 'pending',
                remark: '',
                reexamAppointmentId: null,
                revaccinateAppointmentId: null,
                revaccinationRecordId: null,
                revaccinateBatchId: null,
                updatedAt: new Date().toISOString()
            };
            this.data.recallPetStatuses.push(existing);
        }
        existing.status = status;
        if (remark !== undefined) existing.remark = remark;
        existing.updatedAt = new Date().toISOString();
        this.save();
        return existing;
    },

    createRecallReexamAppointment(recallId, recordId, aptData) {
        const petStatus = this.getRecallPetStatus(recallId, recordId);
        const originalRecord = this.data.vaccinationRecords.find(r => r.id === recordId);
        if (!originalRecord) {
            return { success: false, message: '接种记录不存在' };
        }

        try {
            const appointment = this.addAppointment({
                date: aptData.date,
                timeSlot: aptData.timeSlot,
                petName: originalRecord.petName,
                petType: originalRecord.petType,
                ownerName: originalRecord.ownerName,
                ownerPhone: originalRecord.ownerPhone,
                vaccineName: originalRecord.vaccineName,
                vaccineBatchId: aptData.vaccineBatchId || null,
                remark: `召回复查 · 来源批次${originalRecord.batchNo}`,
                fromRecallId: recallId,
                recallRecordId: recordId,
                recallType: 'reexam'
            });

            if (petStatus) {
                petStatus.reexamAppointmentId = appointment.id;
                if (petStatus.status === 'pending' || petStatus.status === 'notified') {
                    petStatus.status = 'contacted';
                }
                petStatus.updatedAt = new Date().toISOString();
            } else {
                this.setRecallPetStatus(recallId, recordId, 'contacted', '已安排复查');
                const ps = this.getRecallPetStatus(recallId, recordId);
                ps.reexamAppointmentId = appointment.id;
                ps.updatedAt = new Date().toISOString();
            }

            this.addNotification({
                type: 'recall',
                title: '召回复查预约已安排',
                content: `${originalRecord.petName}的${originalRecord.vaccineName}召回复查已预约到${aptData.date} ${aptData.timeSlot}`,
                relatedId: appointment.id
            });

            this.save();
            return { success: true, data: { appointment } };
        } catch (e) {
            return { success: false, message: e.message };
        }
    },

    createRecallRevaccinateAppointment(recallId, recordId, aptData) {
        const petStatus = this.getRecallPetStatus(recallId, recordId);
        const originalRecord = this.data.vaccinationRecords.find(r => r.id === recordId);
        if (!originalRecord) {
            return { success: false, message: '接种记录不存在' };
        }

        const batchId = aptData.vaccineBatchId;
        const batch = this.getBatch(batchId);
        if (!batch || batch.availableQty <= 0) {
            return { success: false, message: '所选批次库存不足', type: 'no_stock' };
        }

        try {
            const appointment = this.addAppointment({
                date: aptData.date,
                timeSlot: aptData.timeSlot,
                petName: originalRecord.petName,
                petType: originalRecord.petType,
                ownerName: originalRecord.ownerName,
                ownerPhone: originalRecord.ownerPhone,
                vaccineName: originalRecord.vaccineName,
                vaccineBatchId: batchId,
                remark: `召回补种 · 原批次${originalRecord.batchNo}，新批次${batch.batchNo}`,
                fromRecallId: recallId,
                recallRecordId: recordId,
                recallType: 'revaccinate',
                originalRecordId: recordId
            });

            if (petStatus) {
                petStatus.revaccinateAppointmentId = appointment.id;
                petStatus.revaccinateBatchId = batchId;
                if (petStatus.status !== 'revaccinated') {
                    petStatus.status = 'reexamined';
                }
                petStatus.updatedAt = new Date().toISOString();
            } else {
                this.setRecallPetStatus(recallId, recordId, 'reexamined', '已安排补种');
                const ps = this.getRecallPetStatus(recallId, recordId);
                ps.revaccinateAppointmentId = appointment.id;
                ps.revaccinateBatchId = batchId;
                ps.updatedAt = new Date().toISOString();
            }

            this.addNotification({
                type: 'recall',
                title: '召回补种预约已安排',
                content: `${originalRecord.petName}的${originalRecord.vaccineName}补种已预约到${aptData.date} ${aptData.timeSlot}（新批次${batch.batchNo}）`,
                relatedId: appointment.id
            });

            this.save();
            return { success: true, data: { appointment, batch } };
        } catch (e) {
            return { success: false, message: e.message };
        }
    },

    completeRecallRevaccination(appointmentId) {
        const apt = this.data.appointments.find(a => a.id === appointmentId);
        if (!apt) return { success: false, message: '预约不存在' };
        if (!apt.fromRecallId || apt.recallType !== 'revaccinate') {
            return { success: false, message: '非召回补种预约' };
        }

        apt.status = 'completed';
        apt.checkedInAt = new Date().toISOString();

        const batch = this.getBatch(apt.vaccineBatchId);
        let vaccinationRecord = null;
        if (batch) {
            vaccinationRecord = this.addVaccinationRecord({
                batchId: batch.id,
                batchNo: batch.batchNo,
                vaccineName: apt.vaccineName,
                petName: apt.petName,
                petType: apt.petType,
                ownerName: apt.ownerName,
                ownerPhone: apt.ownerPhone,
                vaccinationDate: apt.date,
                vaccinationTime: apt.timeSlot.split('-')[0],
                appointmentId: apt.id,
                isRevaccinate: true,
                fromRecallId: apt.fromRecallId,
                originalRecordId: apt.originalRecordId || apt.recallRecordId
            });

            const petStatus = this.getRecallPetStatus(apt.fromRecallId, apt.recallRecordId);
            if (petStatus) {
                petStatus.status = 'revaccinated';
                petStatus.revaccinationRecordId = vaccinationRecord.id;
                petStatus.updatedAt = new Date().toISOString();
            }

            if (apt.originalRecordId) {
                const original = this.data.vaccinationRecords.find(r => r.id === apt.originalRecordId);
                if (original) {
                    original.revaccinationRecordId = vaccinationRecord.id;
                    original.revaccinateBatchId = batch.id;
                }
            }
        }

        this.recalculateSlotBookings();
        this.save();
        return { success: true, data: { vaccinationRecord } };
    },

    getRecallPetStats(recallId) {
        const statuses = (this.data.recallPetStatuses || []).filter(s => s.recallId === recallId);
        const stats = {
            total: 0,
            pending: 0,
            notified: 0,
            contacted: 0,
            reexamined: 0,
            revaccinated: 0,
            no_action: 0,
            completed: 0
        };

        const batchNo = (this.data.recallRecords || []).find(r => r.id === recallId)?.batchNo;
        const records = batchNo ? (this.getRecordsByBatch(batchNo) || []) : [];
        stats.total = records.length;

        records.forEach(r => {
            const s = statuses.find(x => x.recordId === r.id);
            const status = s ? s.status : 'pending';
            stats[status] = (stats[status] || 0) + 1;
        });

        stats.completed = stats.revaccinated + stats.no_action;
        stats.pending = stats.total - stats.notified - stats.contacted - stats.reexamined - stats.revaccinated - stats.no_action;
        if (stats.pending < 0) stats.pending = 0;

        return stats;
    },

    generateMockData() {
        const today = new Date();
        const dateStr = (offset) => {
            const d = new Date(today);
            d.setDate(d.getDate() + offset);
            return d.toISOString().split('T')[0];
        };

        const vaccines = [
            { name: '狂犬疫苗', manufacturer: '硕腾' },
            { name: '犬四联疫苗', manufacturer: '梅里亚' },
            { name: '犬六联疫苗', manufacturer: '硕腾' },
            { name: '猫三联疫苗', manufacturer: '勃林格殷格翰' }
        ];

        vaccines.forEach((v, idx) => {
            const batchId = this.generateId();
            const stockQty = 100 - idx * 15;
            const batch = {
                id: batchId,
                vaccineName: v.name,
                manufacturer: v.manufacturer,
                batchNo: `2025${String(idx + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 100)).padStart(3, '0')}A${idx}`,
                produceDate: dateStr(-30 - idx * 10),
                expireDate: dateStr(180 + idx * 30),
                stockQty: stockQty,
                usedQty: 0,
                reservedQty: 0,
                frozenQty: 0,
                availableQty: stockQty,
                price: [80, 120, 150, 100][idx],
                storageCondition: '2-8℃冷藏',
                remark: '',
                status: 'normal',
                createdAt: new Date().toISOString()
            };
            this.data.vaccineBatches.push(batch);

            this.addStockLedger(batchId, this.STOCK_LEDGER_TYPES.INBOUND, stockQty, 0, stockQty, '初始入库', null, 'inbound');

            const petNames = ['小白', '旺财', '咪咪', '豆豆', '毛球', '乐乐', '贝贝', '妞妞'];
            const ownerNames = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '周九', '吴十'];
            const petTypes = ['犬', '猫'];

            for (let i = 0; i < 5 + idx; i++) {
                const recordId = this.generateId();
                const recordDate = new Date(today);
                recordDate.setDate(recordDate.getDate() - Math.floor(Math.random() * 30));

                const batch = this.data.vaccineBatches[idx];
                batch.usedQty += 1;
                batch.availableQty = batch.stockQty - batch.usedQty - (batch.reservedQty || 0) - (batch.frozenQty || 0);

                this.addStockLedger(
                    batchId,
                    this.STOCK_LEDGER_TYPES.VACCINATE_DEDUCT,
                    -1,
                    batch.availableQty + 1,
                    batch.availableQty,
                    `${petNames[i % petNames.length]}接种`,
                    recordId,
                    'vaccination'
                );

                this.data.vaccinationRecords.push({
                    id: recordId,
                    batchId: batchId,
                    batchNo: batch.batchNo,
                    vaccineName: v.name,
                    petName: petNames[Math.floor(Math.random() * petNames.length)],
                    petType: petTypes[Math.floor(Math.random() * petTypes.length)],
                    ownerName: ownerNames[Math.floor(Math.random() * ownerNames.length)],
                    ownerPhone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
                    vaccinationDate: recordDate.toISOString().split('T')[0],
                    vaccinationTime: `${9 + Math.floor(Math.random() * 8)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
                    status: Math.random() > 0.1 ? 'done' : 'recalled',
                    appointmentId: null,
                    createdAt: recordDate.toISOString()
                });
            }
        });

        const expiryBatch = {
            id: this.generateId(),
            vaccineName: '犬八联疫苗',
            manufacturer: '梅里亚',
            batchNo: '20240615B01',
            produceDate: dateStr(-200),
            expireDate: dateStr(5),
            stockQty: 30,
            usedQty: 0,
            reservedQty: 0,
            frozenQty: 0,
            availableQty: 30,
            price: 180,
            storageCondition: '2-8℃冷藏',
            remark: '',
            status: 'warning',
            createdAt: new Date().toISOString()
        };
        this.data.vaccineBatches.push(expiryBatch);
        this.addStockLedger(expiryBatch.id, this.STOCK_LEDGER_TYPES.INBOUND, 30, 0, 30, '初始入库', null, 'inbound');

        const petNames = ['小白', '旺财', '咪咪', '豆豆', '毛球', '乐乐', '贝贝', '妞妞', '团团', '圆圆'];
        const ownerNames = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '周九', '吴十', '郑十一', '孙十二'];
        const timeRanges = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '14:00-14:30', '14:30-15:00', '15:00-15:30', '15:30-16:00'];

        for (let i = 0; i < 8; i++) {
            const isTimeout = i < 2;
            const isCompleted = i >= 5;
            const apptDate = new Date(today);
            if (isTimeout) {
                apptDate.setHours(apptDate.getHours() - 2);
            }

            const batch = this.data.vaccineBatches[i % this.data.vaccineBatches.length];
            batch.reservedQty = (batch.reservedQty || 0) + 1;
            batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);

            const apptId = this.generateId();

            this.addStockLedger(
                batch.id,
                this.STOCK_LEDGER_TYPES.APPOINTMENT_RESERVE,
                -1,
                batch.availableQty + 1,
                batch.availableQty,
                `${petNames[i]}预约占用`,
                apptId,
                'appointment'
            );

            if (isCompleted) {
                batch.reservedQty -= 1;
                batch.usedQty += 1;
                batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);
                this.addStockLedger(
                    batch.id,
                    this.STOCK_LEDGER_TYPES.VACCINATE_DEDUCT,
                    -1,
                    batch.availableQty + 1,
                    batch.availableQty,
                    `${petNames[i]}完成接种`,
                    apptId,
                    'appointment'
                );
            }

            this.data.appointments.push({
                id: apptId,
                date: dateStr(0),
                timeSlot: timeRanges[i],
                petName: petNames[i],
                petType: ['犬', '猫'][i % 2],
                ownerName: ownerNames[i],
                ownerPhone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
                vaccineName: vaccines[i % vaccines.length].name,
                vaccineBatchId: batch.id,
                remark: '',
                status: isTimeout ? 'timeout' : (isCompleted ? 'completed' : 'confirmed'),
                createdAt: apptDate.toISOString(),
                checkedInAt: isCompleted ? new Date().toISOString() : null,
                timeoutMinutes: isTimeout ? 35 : 0,
                notifyCount: 0,
                fromWaitlist: false
            });
        }

        for (let i = 0; i < 6; i++) {
            const waitDate = new Date(today);
            waitDate.setDate(waitDate.getDate() + (i % 2));

            this.data.waitlistEntries.push({
                id: this.generateId(),
                date: dateStr(i % 2),
                preferredSlots: timeRanges.slice(i % 3, (i % 3) + 2),
                petName: petNames[i + 2],
                petType: ['犬', '猫'][(i + 1) % 2],
                ownerName: ownerNames[i + 2],
                ownerPhone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
                vaccineName: vaccines[(i + 1) % vaccines.length].name,
                rank: i + 1,
                status: i === 0 ? 'notified' : (i === 1 ? 'confirmed' : 'waiting'),
                expiryDays: 3,
                createdAt: new Date(today.getTime() - i * 3600000).toISOString(),
                notifiedAt: i === 0 ? new Date().toISOString() : null,
                confirmedAt: i === 1 ? new Date().toISOString() : null,
                assignedSlot: i === 0 ? '10:00-10:30' : null,
                notifyExpireMinutes: 15,
                fromAppointmentId: null
            });
        }

        const firstRecallBatch = this.data.vaccineBatches[0];
        const firstRecallRecords = this.getRecordsByBatch(firstRecallBatch.batchNo);

        const recallId = this.generateId();
        this.data.recallRecords.push({
            id: recallId,
            batchNo: firstRecallBatch.batchNo,
            batchId: firstRecallBatch.id,
            vaccineName: firstRecallBatch.vaccineName,
            reason: '质量问题',
            description: '该批次疫苗在抽检中发现有效成分含量略低于标准，已联系厂家确认，建议对已接种宠物进行观察。',
            action: '建议观察30天，如有异常及时就医；30天后可免费补种新批次疫苗。',
            level: 'high',
            affectedCount: firstRecallRecords.length,
            notifiedCount: firstRecallRecords.length,
            notifyAll: true,
            status: 'processing',
            createdAt: dateStr(-2),
            createdBy: '王医生'
        });

        firstRecallRecords.forEach((record, idx) => {
            record.status = 'recalled';
            const statuses = ['notified', 'contacted', 'reexamined', 'revaccinated', 'no_action'];
            const status = idx < statuses.length ? statuses[idx] : 'notified';
            this.setRecallPetStatus(recallId, record.id, status, 
                status === 'revaccinated' ? '已补种新批次疫苗，观察中' :
                status === 'reexamined' ? '复查结果正常，建议继续观察' :
                status === 'contacted' ? '宠主表示无异常，预约下周复查' :
                status === 'no_action' ? '宠主选择不处理，签署知情同意' :
                ''
            );
        });

        firstRecallBatch.status = 'recalled';
        firstRecallBatch.frozenQty = firstRecallRecords.length;
        firstRecallBatch.availableQty = firstRecallBatch.stockQty - firstRecallBatch.usedQty - (firstRecallBatch.reservedQty || 0) - firstRecallBatch.frozenQty;

        this.addStockLedger(
            firstRecallBatch.id,
            this.STOCK_LEDGER_TYPES.RECALL_FREEZE,
            -firstRecallRecords.length,
            firstRecallBatch.availableQty + firstRecallRecords.length,
            firstRecallBatch.availableQty,
            `质量问题召回冻结`,
            recallId,
            'recall'
        );

        this.data.notifications.push(
            {
                id: this.generateId(),
                type: 'recall',
                title: '疫苗召回通知',
                content: `批次 ${firstRecallBatch.batchNo} 狂犬疫苗已发起召回，请及时联系受影响宠主。`,
                read: false,
                relatedId: recallId,
                createdAt: dateStr(-2)
            },
            {
                id: this.generateId(),
                type: 'timeout',
                title: '预约超时提醒',
                content: '今日有2个接种预约超时未到，系统已自动释放时段。',
                read: false,
                relatedId: null,
                createdAt: dateStr(0)
            },
            {
                id: this.generateId(),
                type: 'waitlist',
                title: '候补补位通知',
                content: `候补第1位的"${petNames[2]}"已成功补位到 10:00-10:30 时段，请15分钟内确认。`,
                read: true,
                relatedId: this.data.waitlistEntries[0].id,
                createdAt: dateStr(0)
            },
            {
                id: this.generateId(),
                type: 'expiry',
                title: '疫苗效期预警',
                content: `批次 20240615B01 犬八联疫苗将在5天后过期，剩余${expiryBatch.availableQty}剂，请尽快使用。`,
                read: false,
                relatedId: expiryBatch.id,
                createdAt: dateStr(0)
            }
        );

        this.data.waitlistNotifications.push({
            id: this.generateId(),
            waitlistId: this.data.waitlistEntries[0].id,
            date: dateStr(0),
            timeSlot: '10:00-10:30',
            petName: petNames[2],
            ownerName: ownerNames[2],
            type: 'notify',
            status: 'pending_confirm',
            reason: '原预约超时释放',
            sourceAppointmentId: this.data.appointments[2]?.id,
            notifiedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            expireAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            confirmedAt: null,
            timeoutAt: null,
            rankAtNotify: 1
        });

        this.data.activities.push(
            { id: this.generateId(), type: 'vaccine', text: '小白完成狂犬疫苗接种', time: '30分钟前' },
            { id: this.generateId(), type: 'notify', text: '候补1号旺财补位成功，已推送通知', time: '1小时前' },
            { id: this.generateId(), type: 'register', text: '新登记批次 20250312003A2 猫三联疫苗', time: '2小时前' },
            { id: this.generateId(), type: 'recall', text: '狂犬疫苗批次召回通知已发送给5位宠主', time: '昨天 15:30' },
            { id: this.generateId(), type: 'vaccine', text: '豆豆完成犬六联疫苗接种', time: '昨天 10:15' }
        );
    },

    ensureTimeSlots() {
        const today = new Date();
        for (let offset = 0; offset < 7; offset++) {
            const d = new Date(today);
            d.setDate(d.getDate() + offset);
            const dateKey = d.toISOString().split('T')[0];
            if (!this.data.timeSlots[dateKey]) {
                const slots = [];
                const morning = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30'];
                const afternoon = ['14:00-14:30', '14:30-15:00', '15:00-15:30', '15:30-16:00', '16:00-16:30', '16:30-17:00'];

                morning.forEach(time => {
                    slots.push({
                        time: time,
                        capacity: 3,
                        booked: 0,
                        period: 'morning'
                    });
                });
                afternoon.forEach(time => {
                    slots.push({
                        time: time,
                        capacity: 3,
                        booked: 0,
                        period: 'afternoon'
                    });
                });
                this.data.timeSlots[dateKey] = slots;
            }
        }
    },

    recalculateSlotBookings() {
        Object.keys(this.data.timeSlots).forEach(dateKey => {
            this.data.timeSlots[dateKey].forEach(slot => {
                slot.booked = this.data.appointments.filter(a =>
                    a.date === dateKey &&
                    a.timeSlot === slot.time &&
                    ['confirmed', 'completed'].includes(a.status)
                ).length;
            });
        });
    },

    recalculateAllBatchQty() {
        this.data.vaccineBatches.forEach(batch => {
            if (batch.reservedQty === undefined) batch.reservedQty = 0;
            if (batch.frozenQty === undefined) batch.frozenQty = 0;
            if (batch.usedQty === undefined) batch.usedQty = 0;
            if (batch.stockQty === undefined) batch.stockQty = 0;
            batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - batch.frozenQty;
            if (batch.availableQty < 0) batch.availableQty = 0;
        });
    },

    getSlotCapacity(date, timeSlot) {
        const slots = this.data.timeSlots[date] || [];
        const slot = slots.find(s => s.time === timeSlot);
        return slot ? slot.capacity : 3;
    },

    getSlotBooked(date, timeSlot) {
        return this.data.appointments.filter(a =>
            a.date === date &&
            a.timeSlot === timeSlot &&
            ['confirmed', 'completed'].includes(a.status)
        ).length;
    },

    isSlotFull(date, timeSlot) {
        return this.getSlotBooked(date, timeSlot) >= this.getSlotCapacity(date, timeSlot);
    },

    getBatch(batchId) {
        return this.data.vaccineBatches.find(b => b.id === batchId);
    },

    addBatch(batchData) {
        const batch = {
            id: this.generateId(),
            ...batchData,
            usedQty: 0,
            reservedQty: 0,
            frozenQty: 0,
            availableQty: batchData.stockQty,
            status: 'normal',
            createdAt: new Date().toISOString()
        };
        this.data.vaccineBatches.unshift(batch);

        this.addStockLedger(
            batch.id,
            this.STOCK_LEDGER_TYPES.INBOUND,
            batch.stockQty,
            0,
            batch.stockQty,
            '新批次入库登记',
            null,
            'inbound'
        );

        this.addActivity('register', `新登记批次 ${batch.batchNo} ${batch.vaccineName}`);
        this.save();
        return batch;
    },

    updateBatchStatus(batchId, status) {
        const batch = this.getBatch(batchId);
        if (batch) {
            batch.status = status;
            this.save();
        }
    },

    getRecordsByBatch(batchNo) {
        return this.data.vaccinationRecords.filter(r => r.batchNo === batchNo);
    },

    getRecordsByBatchId(batchId) {
        return this.data.vaccinationRecords.filter(r => r.batchId === batchId);
    },

    addVaccinationRecord(record) {
        const newRecord = {
            id: this.generateId(),
            isRevaccinate: false,
            fromRecallId: null,
            originalRecordId: null,
            revaccinationRecordId: null,
            revaccinateBatchId: null,
            ...record,
            status: 'done',
            createdAt: new Date().toISOString()
        };
        this.data.vaccinationRecords.unshift(newRecord);

        const batch = this.getBatch(record.batchId);
        if (batch) {
            const beforeQty = batch.availableQty;
            batch.usedQty = (batch.usedQty || 0) + 1;
            if (batch.reservedQty > 0) {
                batch.reservedQty -= 1;
            }
            batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);

            const remark = newRecord.isRevaccinate 
                ? `${record.petName}召回补种完成` 
                : `${record.petName}完成接种`;

            this.addStockLedger(
                batch.id,
                newRecord.isRevaccinate ? this.STOCK_LEDGER_TYPES.REVACCINATE_ADD : this.STOCK_LEDGER_TYPES.VACCINATE_DEDUCT,
                -1,
                beforeQty,
                batch.availableQty,
                remark,
                newRecord.id,
                'vaccination'
            );

            this.addActivity('vaccine', `${record.petName}完成${record.vaccineName}${newRecord.isRevaccinate ? '(召回补种)' : ''}接种`);
        }
        this.save();
        return newRecord;
    },

    addRecall(recallData) {
        const affectedRecords = this.getRecordsByBatch(recallData.batchNo);
        const recall = {
            id: this.generateId(),
            ...recallData,
            affectedCount: affectedRecords.length,
            notifiedCount: recallData.notifyAll ? affectedRecords.length : 0,
            status: 'processing',
            createdAt: new Date().toISOString().split('T')[0],
            createdBy: '当前用户'
        };
        this.data.recallRecords.unshift(recall);

        if (recallData.notifyAll) {
            affectedRecords.forEach(r => {
                r.status = 'recalled';
                this.setRecallPetStatus(recall.id, r.id, 'notified', '系统自动通知');
                this.addNotification({
                    type: 'recall',
                    title: '疫苗召回通知',
                    content: `尊敬的${r.ownerName}，您的宠物${r.petName}于${r.vaccinationDate}接种的${r.vaccineName}（批次${r.batchNo}）因${recall.reason}需要召回，请联系医院处理。`,
                    relatedId: recall.id
                });
            });
        }

        const batch = this.data.vaccineBatches.find(b => b.batchNo === recallData.batchNo);
        if (batch) {
            batch.status = 'recalled';
            const remaining = batch.stockQty - batch.usedQty - batch.reservedQty;
            const freezeQty = Math.min(affectedRecords.length, remaining);
            batch.frozenQty = (batch.frozenQty || 0) + freezeQty;
            batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - batch.frozenQty;

            this.addStockLedger(
                batch.id,
                this.STOCK_LEDGER_TYPES.RECALL_FREEZE,
                -freezeQty,
                batch.availableQty + freezeQty,
                batch.availableQty,
                `${recall.reason}召回冻结`,
                recall.id,
                'recall'
            );
        }

        this.addNotification({
            type: 'recall',
            title: '疫苗召回通知',
            content: `批次 ${recall.batchNo} ${recall.vaccineName} 已发起召回，共影响${affectedRecords.length}条接种记录。`,
            relatedId: recall.id
        });
        this.addActivity('recall', `发起${recall.vaccineName}批次召回，影响${affectedRecords.length}只宠物`);

        this.save();
        return recall;
    },

    addAppointment(appointmentData) {
        const { date, timeSlot } = appointmentData;
        if (this.isSlotFull(date, timeSlot)) {
            throw new Error('该时段已满，无法预约');
        }

        const appointment = {
            id: this.generateId(),
            fromRecallId: null,
            recallRecordId: null,
            recallType: null,
            originalRecordId: null,
            waitlistId: null,
            ...appointmentData,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            checkedInAt: null,
            timeoutMinutes: 0,
            notifyCount: 0
        };
        this.data.appointments.unshift(appointment);

        if (appointment.vaccineBatchId) {
            const batch = this.getBatch(appointment.vaccineBatchId);
            if (batch) {
                const beforeQty = batch.availableQty;
                batch.reservedQty = (batch.reservedQty || 0) + 1;
                batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);

                const remark = appointment.fromRecallId
                    ? `${appointment.petName}${appointment.recallType === 'revaccinate' ? '召回补种' : '召回复查'}预约占用`
                    : (appointment.fromWaitlist || appointment.waitlistId
                        ? `${appointment.petName}候补补位预约占用`
                        : `${appointment.petName}预约占用`);

                this.addStockLedger(
                    batch.id,
                    this.STOCK_LEDGER_TYPES.APPOINTMENT_RESERVE,
                    -1,
                    beforeQty,
                    batch.availableQty,
                    remark,
                    appointment.id,
                    'appointment'
                );
            }
        }

        this.recalculateSlotBookings();
        this.save();
        return appointment;
    },

    cancelAppointment(appointmentId) {
        const apt = this.data.appointments.find(a => a.id === appointmentId);
        if (apt && apt.status !== 'cancelled') {
            const oldStatus = apt.status;
            apt.status = 'cancelled';

            if (apt.vaccineBatchId && ['confirmed', 'timeout'].includes(oldStatus)) {
                const batch = this.getBatch(apt.vaccineBatchId);
                if (batch && batch.reservedQty > 0) {
                    const beforeQty = batch.availableQty;
                    batch.reservedQty -= 1;
                    batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);

                    this.addStockLedger(
                        batch.id,
                        this.STOCK_LEDGER_TYPES.APPOINTMENT_CANCEL,
                        1,
                        beforeQty,
                        batch.availableQty,
                        `${apt.petName}取消预约`,
                        apt.id,
                        'appointment'
                    );
                }
            }

            this.recalculateSlotBookings();
            this.tryFillFromWaitlist(apt.date, apt.timeSlot, apt.id);
            this.save();
        }
    },

    checkInAppointment(appointmentId) {
        const apt = this.data.appointments.find(a => a.id === appointmentId);
        if (apt && apt.status !== 'completed' && apt.status !== 'cancelled') {
            if (apt.fromRecallId && apt.recallType === 'revaccinate') {
                this.completeRecallRevaccination(appointmentId);
                return;
            }

            apt.status = 'completed';
            apt.checkedInAt = new Date().toISOString();

            const batch = apt.vaccineBatchId ? this.getBatch(apt.vaccineBatchId) : null;
            if (batch) {
                this.addVaccinationRecord({
                    batchId: batch.id,
                    batchNo: batch.batchNo,
                    vaccineName: apt.vaccineName,
                    petName: apt.petName,
                    petType: apt.petType,
                    ownerName: apt.ownerName,
                    ownerPhone: apt.ownerPhone,
                    vaccinationDate: apt.date,
                    vaccinationTime: apt.timeSlot.split('-')[0],
                    appointmentId: apt.id,
                    fromRecallId: apt.fromRecallId || null,
                    recallType: apt.recallType || null
                });
            }
            this.recalculateSlotBookings();
            this.save();
        }
    },

    releaseTimeoutAppointments() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        let releasedCount = 0;

        this.data.appointments.forEach(apt => {
            if (apt.status === 'confirmed' && apt.date === todayStr) {
                const [startTime] = apt.timeSlot.split('-');
                const [hours, minutes] = startTime.split(':').map(Number);
                const slotDate = new Date(now);
                slotDate.setHours(hours, minutes, 0, 0);

                const diffMinutes = (now - slotDate) / (1000 * 60);

                if (diffMinutes > 30) {
                    apt.status = 'timeout';
                    apt.timeoutMinutes = Math.floor(diffMinutes);
                    releasedCount++;

                    if (apt.vaccineBatchId) {
                        const batch = this.getBatch(apt.vaccineBatchId);
                        if (batch && batch.reservedQty > 0) {
                            const beforeQty = batch.availableQty;
                            batch.reservedQty -= 1;
                            batch.availableQty = batch.stockQty - batch.usedQty - batch.reservedQty - (batch.frozenQty || 0);

                            this.addStockLedger(
                                batch.id,
                                this.STOCK_LEDGER_TYPES.APPOINTMENT_CANCEL,
                                1,
                                beforeQty,
                                batch.availableQty,
                                `${apt.petName}超时释放`,
                                apt.id,
                                'appointment'
                            );
                        }
                    }

                    this.tryFillFromWaitlist(apt.date, apt.timeSlot, apt.id);
                }
            }
        });

        if (releasedCount > 0) {
            this.addNotification({
                type: 'timeout',
                title: '预约超时释放',
                content: `系统检测到${releasedCount}个超时预约，已自动释放并通知候补人员。`
            });
            this.recalculateSlotBookings();
            this.save();
        }
        return releasedCount;
    },

    getAppointmentsByDate(date) {
        return this.data.appointments.filter(a => a.date === date);
    },

    getAppointmentsBySlot(date, timeSlot) {
        return this.data.appointments.filter(a =>
            a.date === date &&
            a.timeSlot === timeSlot &&
            a.status !== 'cancelled'
        );
    },

    addWaitlistEntry(entryData) {
        const sameDateEntries = this.data.waitlistEntries.filter(e =>
            e.date === entryData.date &&
            e.status !== 'expired' &&
            e.status !== 'confirmed'
        );

        const entry = {
            id: this.generateId(),
            ...entryData,
            rank: sameDateEntries.length + 1,
            status: 'waiting',
            createdAt: new Date().toISOString(),
            notifiedAt: null,
            confirmedAt: null,
            assignedSlot: null,
            notifyExpireMinutes: entryData.notifyExpireMinutes || 15,
            fromAppointmentId: null
        };
        this.data.waitlistEntries.unshift(entry);
        this.save();
        return entry;
    },

    tryFillFromWaitlist(date, timeSlot, sourceAppointmentId) {
        if (this.isSlotFull(date, timeSlot)) {
            return null;
        }

        const candidates = this.data.waitlistEntries
            .filter(e =>
                e.date === date &&
                e.status === 'waiting' &&
                (e.preferredSlots.length === 0 || e.preferredSlots.includes(timeSlot))
            )
            .sort((a, b) => a.rank - b.rank);

        if (candidates.length > 0) {
            const winner = candidates[0];
            winner.status = 'notified';
            winner.notifiedAt = new Date().toISOString();
            winner.assignedSlot = timeSlot;
            winner.fromAppointmentId = sourceAppointmentId || null;

            const expireAt = new Date(Date.now() + winner.notifyExpireMinutes * 60 * 1000);

            const notification = {
                id: this.generateId(),
                waitlistId: winner.id,
                date,
                timeSlot,
                petName: winner.petName,
                ownerName: winner.ownerName,
                type: 'notify',
                status: 'pending_confirm',
                reason: sourceAppointmentId ? '原预约取消释放' : '时段释放',
                sourceAppointmentId: sourceAppointmentId || null,
                notifiedAt: winner.notifiedAt,
                expireAt: expireAt.toISOString(),
                confirmedAt: null,
                timeoutAt: null,
                rankAtNotify: winner.rank
            };
            this.data.waitlistNotifications.unshift(notification);

            this.addNotification({
                type: 'waitlist',
                title: '候补补位通知',
                content: `候补第${winner.rank}位的${winner.petName}（宠主：${winner.ownerName}）已补位到 ${date} ${timeSlot}，请${winner.notifyExpireMinutes}分钟内确认，超时自动顺延。`,
                relatedId: winner.id
            });
            this.addActivity('notify', `候补${winner.rank}号${winner.petName}补位到${timeSlot}，已推送通知`);

            this.data.waitlistEntries
                .filter(e => e.date === date && e.rank > winner.rank && e.status === 'waiting')
                .forEach(e => e.rank--);

            this.save();
            return winner;
        }
        return null;
    },

    processExpiredWaitlistNotifications() {
        const now = new Date();
        let expiredCount = 0;

        const expiredNotifications = this.data.waitlistNotifications
            .filter(n => n.status === 'pending_confirm' && new Date(n.expireAt) <= now);

        expiredNotifications.forEach(notification => {
            notification.status = 'timeout';
            notification.timeoutAt = now.toISOString();
            notification.expiredAt = now.toISOString();

            const entry = this.data.waitlistEntries.find(e => e.id === notification.waitlistId);
            const date = notification.date;
            const timeSlot = notification.timeSlot;

            if (entry) {
                entry.status = 'waiting';
                entry.notifiedAt = null;
                entry.assignedSlot = null;

                const sameDateWaiting = this.data.waitlistEntries
                    .filter(e => e.date === date && e.status === 'waiting');
                entry.rank = sameDateWaiting.length;
            }

            const nextWinner = this.tryFillFromWaitlist(date, timeSlot, null);

            if (nextWinner) {
                const nextNotif = this.data.waitlistNotifications
                    .filter(n => n.waitlistId === nextWinner.id && n.status === 'pending_confirm')[0];
                if (nextNotif) {
                    nextNotif.expiredBy = notification.waitlistId;
                    nextNotif.expiredByNotifId = notification.id;
                    notification.followedBy = nextWinner.id;
                }
            }

            this.addNotification({
                type: 'waitlist',
                title: '候补补位超时',
                content: `${notification.petName}（宠主：${notification.ownerName}）未在规定时间内确认补位，已自动顺延给下一位候补人员。`,
                relatedId: notification.waitlistId
            });

            expiredCount++;
        });

        if (expiredCount > 0) {
            this.recalculateSlotBookings();
            this.save();
        }
        return expiredCount;
    },

    confirmWaitlistEntry(entryId) {
        const entry = this.data.waitlistEntries.find(e => e.id === entryId);
        if (!entry || entry.status !== 'notified' || !entry.assignedSlot) {
            return { success: false, message: '补位状态无效' };
        }

        if (this.isSlotFull(entry.date, entry.assignedSlot)) {
            return { success: false, message: '该时段已满，无法确认补位' };
        }

        const availableBatches = this.getAvailableBatchesForVaccine(entry.vaccineName);
        if (availableBatches.length === 0) {
            return {
                success: false,
                message: `${entry.vaccineName}暂无可用疫苗批次，请等待新批次入库或选择其他疫苗`,
                type: 'no_stock'
            };
        }
        const assignedBatch = availableBatches[0];

        entry.status = 'confirmed';
        entry.confirmedAt = new Date().toISOString();

        const notification = this.data.waitlistNotifications
            .filter(n => n.waitlistId === entryId && n.status === 'pending_confirm')
            .sort((a, b) => new Date(b.notifiedAt) - new Date(a.notifiedAt))[0];
        if (notification) {
            notification.status = 'confirmed';
            notification.confirmedAt = new Date().toISOString();
        }

        try {
            this.addAppointment({
                date: entry.date,
                timeSlot: entry.assignedSlot,
                petName: entry.petName,
                petType: entry.petType,
                ownerName: entry.ownerName,
                ownerPhone: entry.ownerPhone,
                vaccineName: entry.vaccineName,
                vaccineBatchId: assignedBatch.id,
                remark: '候补补位',
                fromWaitlist: true,
                waitlistId: entryId
            });
        } catch (e) {
            entry.status = 'notified';
            entry.confirmedAt = null;
            if (notification) {
                notification.status = 'pending_confirm';
                notification.confirmedAt = null;
            }
            return { success: false, message: e.message };
        }

        this.save();
        return { success: true, data: { timeSlot: entry.assignedSlot, batch: assignedBatch } };
    },

    skipWaitlistEntry(entryId) {
        const entry = this.data.waitlistEntries.find(e => e.id === entryId);
        if (!entry || entry.status !== 'notified' || !entry.assignedSlot) {
            return false;
        }

        const notification = this.data.waitlistNotifications
            .filter(n => n.waitlistId === entryId && n.status === 'pending_confirm')
            .sort((a, b) => new Date(b.notifiedAt) - new Date(a.notifiedAt))[0];
        if (notification) {
            notification.status = 'skipped';
        }

        const date = entry.date;
        const timeSlot = entry.assignedSlot;

        entry.status = 'waiting';
        entry.notifiedAt = null;
        entry.assignedSlot = null;

        const sameDateWaiting = this.data.waitlistEntries
            .filter(e => e.date === date && e.status === 'waiting');
        entry.rank = sameDateWaiting.length;

        const nextWinner = this.tryFillFromWaitlist(date, timeSlot, null);

        if (nextWinner && notification) {
            const nextNotif = this.data.waitlistNotifications
                .filter(n => n.waitlistId === nextWinner.id && n.status === 'pending_confirm')[0];
            if (nextNotif) {
                nextNotif.expiredBy = entryId;
                notification.followedBy = nextWinner.id;
            }
        }

        this.save();
        return true;
    },

    cancelWaitlistEntry(entryId) {
        const entry = this.data.waitlistEntries.find(e => e.id === entryId);
        if (entry && entry.status !== 'expired' && entry.status !== 'confirmed') {
            const date = entry.date;
            const rank = entry.rank;

            if (entry.status === 'notified' && entry.assignedSlot) {
                const notification = this.data.waitlistNotifications
                    .filter(n => n.waitlistId === entryId && n.status === 'pending_confirm')
                    .sort((a, b) => new Date(b.notifiedAt) - new Date(a.notifiedAt))[0];
                if (notification) {
                    notification.status = 'cancelled';
                }

                this.tryFillFromWaitlist(entry.date, entry.assignedSlot, null);
            }

            this.data.waitlistEntries = this.data.waitlistEntries.filter(e => e.id !== entryId);

            this.data.waitlistEntries
                .filter(e => e.date === date && e.status === 'waiting' && e.rank > rank)
                .forEach(e => e.rank--);

            this.save();
            return true;
        }
        return false;
    },

    getWaitlistByDate(date) {
        return this.data.waitlistEntries
            .filter(e => e.date === date)
            .sort((a, b) => {
                const statusOrder = { notified: 0, confirmed: 1, waiting: 2, expired: 3 };
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                return a.rank - b.rank;
            });
    },

    getWaitlistNotifications(waitlistId) {
        if (waitlistId) {
            return this.data.waitlistNotifications
                .filter(n => n.waitlistId === waitlistId)
                .sort((a, b) => new Date(b.notifiedAt) - new Date(a.notifiedAt));
        }
        return [...this.data.waitlistNotifications]
            .sort((a, b) => new Date(b.notifiedAt) - new Date(a.notifiedAt));
    },

    addNotification(notificationData) {
        const notification = {
            id: this.generateId(),
            ...notificationData,
            read: false,
            createdAt: new Date().toISOString()
        };
        this.data.notifications.unshift(notification);
        this.save();
        return notification;
    },

    getUnreadNotificationCount() {
        return this.data.notifications.filter(n => !n.read).length;
    },

    markNotificationAsRead(notificationId) {
        const n = this.data.notifications.find(x => x.id === notificationId);
        if (n) {
            n.read = true;
            this.save();
        }
    },

    markAllNotificationsAsRead() {
        this.data.notifications.forEach(n => n.read = true);
        this.save();
    },

    addActivity(type, text) {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        this.data.activities.unshift({
            id: this.generateId(),
            type,
            text,
            time: time === '24:00' ? '00:00' : time
        });
        if (this.data.activities.length > 50) {
            this.data.activities = this.data.activities.slice(0, 50);
        }
        this.save();
    },

    getAvailableBatchesForVaccine(vaccineName) {
        return this.data.vaccineBatches
            .filter(b =>
                b.vaccineName === vaccineName &&
                b.status === 'normal' &&
                b.availableQty > 0
            )
            .sort((a, b) => new Date(a.expireDate) - new Date(b.expireDate));
    },

    getVaccineHasStock(vaccineName) {
        return this.getAvailableBatchesForVaccine(vaccineName).length > 0;
    },

    getWarnings() {
        const warnings = [];
        const today = new Date();

        this.data.vaccineBatches.forEach(batch => {
            const expireDate = new Date(batch.expireDate);
            const daysLeft = Math.ceil((expireDate - today) / (1000 * 60 * 60 * 24));
            const remaining = batch.availableQty || 0;

            if (daysLeft <= 30 && daysLeft > 0 && remaining > 0) {
                warnings.push({
                    id: `expire-${batch.id}`,
                    type: 'expire',
                    title: `${batch.vaccineName} 即将过期`,
                    desc: `批次 ${batch.batchNo} 剩余${remaining}剂，${daysLeft}天后过期`
                });
            }
        });

        const todayStr = today.toISOString().split('T')[0];
        const timeoutCount = this.data.appointments.filter(a =>
            a.date === todayStr && a.status === 'timeout'
        ).length;
        if (timeoutCount > 0) {
            warnings.push({
                id: 'timeout-1',
                type: 'timeout',
                title: `${timeoutCount}个预约超时`,
                desc: '已自动释放并通知候补人员'
            });
        }

        this.data.recallRecords.filter(r => r.status === 'processing').forEach(r => {
            const stats = this.getRecallPetStats(r.id);
            const pendingCount = stats.total - stats.completed;
            warnings.push({
                id: `recall-${r.id}`,
                type: 'recall',
                title: `召回处理中：${r.vaccineName}`,
                desc: `批次 ${r.batchNo}，${pendingCount}只宠物待处理`
            });
        });

        return warnings;
    }
};