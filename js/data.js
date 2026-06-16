const DataStore = {
    STORAGE_KEY: 'pet_vaccine_app_data',
    
    defaults: {
        vaccineBatches: [],
        vaccinationRecords: [],
        appointments: [],
        waitlistEntries: [],
        recallRecords: [],
        notifications: [],
        activities: [],
        timeSlots: {}
    },

    data: null,

    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                this.data = JSON.parse(saved);
            } catch (e) {
                this.data = JSON.parse(JSON.stringify(this.defaults));
            }
        } else {
            this.data = JSON.parse(JSON.stringify(this.defaults));
            this.generateMockData();
        }
        this.ensureTimeSlots();
        this.save();
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
            const batch = {
                id: batchId,
                vaccineName: v.name,
                manufacturer: v.manufacturer,
                batchNo: `2025${String(idx + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 100)).padStart(3, '0')}A${idx}`,
                produceDate: dateStr(-30 - idx * 10),
                expireDate: dateStr(180 + idx * 30),
                stockQty: 100 - idx * 15,
                usedQty: 20 + idx * 8,
                price: [80, 120, 150, 100][idx],
                storageCondition: '2-8℃冷藏',
                remark: '',
                status: 'normal',
                createdAt: new Date().toISOString()
            };
            this.data.vaccineBatches.push(batch);

            const petNames = ['小白', '旺财', '咪咪', '豆豆', '毛球', '乐乐', '贝贝', '妞妞'];
            const ownerNames = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '周九', '吴十'];
            const petTypes = ['犬', '猫'];

            for (let i = 0; i < 5 + idx; i++) {
                const recordId = this.generateId();
                const recordDate = new Date(today);
                recordDate.setDate(recordDate.getDate() - Math.floor(Math.random() * 30));
                
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
            usedQty: 45,
            price: 180,
            storageCondition: '2-8℃冷藏',
            remark: '',
            status: 'warning',
            createdAt: new Date().toISOString()
        };
        this.data.vaccineBatches.push(expiryBatch);

        const petNames = ['小白', '旺财', '咪咪', '豆豆', '毛球', '乐乐', '贝贝', '妞妞', '团团', '圆圆'];
        const ownerNames = ['张三', '李四', '王五', '赵六', '陈七', '刘八', '周九', '吴十', '郑十一', '孙十二'];
        const timeRanges = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '14:00-14:30', '14:30-15:00', '15:00-15:30', '15:30-16:00'];
        
        for (let i = 0; i < 8; i++) {
            const isTimeout = i < 2;
            const apptDate = new Date(today);
            if (isTimeout) {
                apptDate.setHours(apptDate.getHours() - 2);
            }
            
            this.data.appointments.push({
                id: this.generateId(),
                date: dateStr(0),
                timeSlot: timeRanges[i],
                petName: petNames[i],
                petType: ['犬', '猫'][i % 2],
                ownerName: ownerNames[i],
                ownerPhone: `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
                vaccineName: vaccines[i % vaccines.length].name,
                vaccineBatchId: this.data.vaccineBatches[i % this.data.vaccineBatches.length].id,
                remark: '',
                status: isTimeout ? 'timeout' : (i < 5 ? 'confirmed' : 'completed'),
                createdAt: apptDate.toISOString(),
                checkedInAt: i >= 5 ? new Date().toISOString() : null,
                timeoutMinutes: isTimeout ? 35 : 0,
                notifyCount: 0
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
                confirmedAt: i === 1 ? new Date().toISOString() : null
            });
        }

        this.data.recallRecords.push({
            id: this.generateId(),
            batchNo: this.data.vaccineBatches[0].batchNo,
            batchId: this.data.vaccineBatches[0].id,
            vaccineName: this.data.vaccineBatches[0].vaccineName,
            reason: '质量问题',
            description: '该批次疫苗在抽检中发现有效成分含量略低于标准，已联系厂家确认，建议对已接种宠物进行观察。',
            action: '建议观察30天，如有异常及时就医；30天后可免费补种新批次疫苗。',
            level: 'high',
            affectedCount: 5,
            notifiedCount: 5,
            notifyAll: true,
            status: 'processing',
            createdAt: dateStr(-2),
            createdBy: '王医生'
        });

        this.data.notifications.push(
            {
                id: this.generateId(),
                type: 'recall',
                title: '疫苗召回通知',
                content: `批次 ${this.data.vaccineBatches[0].batchNo} 狂犬疫苗已发起召回，请及时联系受影响宠主。`,
                read: false,
                relatedId: this.data.recallRecords[0].id,
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
                content: '候补第1位的"小白"已成功补位到 10:00-10:30 时段，已通知宠主。',
                read: true,
                relatedId: this.data.waitlistEntries[0].id,
                createdAt: dateStr(0)
            },
            {
                id: this.generateId(),
                type: 'expiry',
                title: '疫苗效期预警',
                content: `批次 20240615B01 犬八联疫苗将在5天后过期，剩余30剂，请尽快使用。`,
                read: false,
                relatedId: expiryBatch.id,
                createdAt: dateStr(0)
            }
        );

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
        this.recalculateSlotBookings();
    },

    recalculateSlotBookings() {
        Object.keys(this.data.timeSlots).forEach(dateKey => {
            this.data.timeSlots[dateKey].forEach(slot => {
                slot.booked = this.data.appointments.filter(a => 
                    a.date === dateKey && 
                    a.timeSlot === slot.time && 
                    ['confirmed', 'timeout', 'completed'].includes(a.status)
                ).length;
            });
        });
    },

    getBatch(batchId) {
        return this.data.vaccineBatches.find(b => b.id === batchId);
    },

    addBatch(batchData) {
        const batch = {
            id: this.generateId(),
            ...batchData,
            usedQty: 0,
            status: 'normal',
            createdAt: new Date().toISOString()
        };
        this.data.vaccineBatches.unshift(batch);
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
            ...record,
            status: 'done',
            createdAt: new Date().toISOString()
        };
        this.data.vaccinationRecords.unshift(newRecord);
        
        const batch = this.getBatch(record.batchId);
        if (batch) {
            batch.usedQty = (batch.usedQty || 0) + 1;
            this.addActivity('vaccine', `${record.petName}完成${record.vaccineName}接种`);
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
                this.addNotification({
                    type: 'recall',
                    title: '疫苗召回通知',
                    content: `尊敬的${r.ownerName}，您的宠物${r.petName}于${r.vaccinationDate}接种的${r.vaccineName}（批次${r.batchNo}）因${recall.reason}需要召回，请联系医院处理。`,
                    relatedId: recall.id
                });
            });
        }

        this.addNotification({
            type: 'recall',
            title: '疫苗召回通知',
            content: `批次 ${recall.batchNo} ${recall.vaccineName} 已发起召回，共影响${affectedRecords.length}条接种记录。`,
            relatedId: recall.id
        });
        this.addActivity('recall', `发起${recall.vaccineName}批次召回，影响${affectedRecords.length}只宠物`);
        
        const batch = this.data.vaccineBatches.find(b => b.batchNo === recallData.batchNo);
        if (batch) {
            batch.status = 'recalled';
        }
        
        this.save();
        return recall;
    },

    addAppointment(appointmentData) {
        const appointment = {
            id: this.generateId(),
            ...appointmentData,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            checkedInAt: null,
            timeoutMinutes: 0,
            notifyCount: 0
        };
        this.data.appointments.unshift(appointment);
        this.recalculateSlotBookings();
        this.save();
        return appointment;
    },

    cancelAppointment(appointmentId) {
        const apt = this.data.appointments.find(a => a.id === appointmentId);
        if (apt) {
            apt.status = 'cancelled';
            this.recalculateSlotBookings();
            this.tryFillFromWaitlist(apt.date, apt.timeSlot);
            this.save();
        }
    },

    checkInAppointment(appointmentId) {
        const apt = this.data.appointments.find(a => a.id === appointmentId);
        if (apt) {
            apt.status = 'completed';
            apt.checkedInAt = new Date().toISOString();
            
            const batch = this.data.vaccineBatches.find(b => b.id === apt.vaccineBatchId);
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
                    appointmentId: apt.id
                });
            }
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
                    
                    this.tryFillFromWaitlist(apt.date, apt.timeSlot);
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
            confirmedAt: null
        };
        this.data.waitlistEntries.unshift(entry);
        this.save();
        return entry;
    },

    tryFillFromWaitlist(date, timeSlot) {
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
            
            this.addNotification({
                type: 'waitlist',
                title: '候补补位成功',
                content: `候补第${winner.rank}位的${winner.petName}（宠主：${winner.ownerName}）已补位到 ${date} ${timeSlot}，请及时确认。`,
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

    confirmWaitlistEntry(entryId) {
        const entry = this.data.waitlistEntries.find(e => e.id === entryId);
        if (entry && entry.status === 'notified' && entry.assignedSlot) {
            entry.status = 'confirmed';
            entry.confirmedAt = new Date().toISOString();

            const batch = this.data.vaccineBatches.find(b => 
                b.vaccineName === entry.vaccineName && 
                b.status === 'normal' &&
                b.stockQty > (b.usedQty || 0)
            );

            this.addAppointment({
                date: entry.date,
                timeSlot: entry.assignedSlot,
                petName: entry.petName,
                petType: entry.petType,
                ownerName: entry.ownerName,
                ownerPhone: entry.ownerPhone,
                vaccineName: entry.vaccineName,
                vaccineBatchId: batch ? batch.id : null,
                remark: '候补补位',
                fromWaitlist: true,
                waitlistId: entryId
            });
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
                b.stockQty > (b.usedQty || 0)
            )
            .sort((a, b) => new Date(a.expireDate) - new Date(b.expireDate));
    },

    getWarnings() {
        const warnings = [];
        const today = new Date();
        
        this.data.vaccineBatches.forEach(batch => {
            const expireDate = new Date(batch.expireDate);
            const daysLeft = Math.ceil((expireDate - today) / (1000 * 60 * 60 * 24));
            const remaining = batch.stockQty - (batch.usedQty || 0);
            
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
            warnings.push({
                id: `recall-${r.id}`,
                type: 'recall',
                title: `召回处理中：${r.vaccineName}`,
                desc: `批次 ${r.batchNo}，${r.affectedCount}只宠物待回访`
            });
        });

        return warnings;
    }
};