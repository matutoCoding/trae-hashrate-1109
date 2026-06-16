const App = {
    currentPage: 'page-dashboard',
    pageHistory: [],

    pageTitles: {
        'page-dashboard': '疫苗接种管理',
        'page-batch': '疫苗批次管理',
        'page-recall': '流向召回',
        'page-schedule': '接种排期',
        'page-waitlist': '候补补位'
    },

    init() {
        DataStore.init();
        
        BatchModule.init();
        RecallModule.init();
        ScheduleModule.init();
        WaitlistModule.init();

        this.bindNavigation();
        this.bindNotificationDrawer();
        this.bindGlobalEvents();
        this.updateDashboardStats();
        this.renderWarnings();
        this.renderActivities();
        this.updateNotificationBadge();

        this.startTimeoutCheck();
    },

    bindNavigation() {
        document.querySelectorAll('.dd-tab-item').forEach(item => {
            item.addEventListener('click', () => {
                const pageId = item.dataset.page;
                this.navigateTo(pageId);
            });
        });

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const pageId = item.dataset.page;
                this.navigateTo(pageId);
            });
        });

        document.getElementById('headerBack').addEventListener('click', () => {
            this.goBack();
        });
    },

    bindNotificationDrawer() {
        document.getElementById('notificationBell').addEventListener('click', () => {
            this.openNotificationDrawer();
        });

        document.getElementById('closeNotificationDrawer').addEventListener('click', () => {
            this.closeNotificationDrawer();
        });

        document.querySelector('#notificationDrawer .drawer-mask').addEventListener('click', () => {
            this.closeNotificationDrawer();
        });
    },

    bindGlobalEvents() {
        document.querySelectorAll('.modal-mask').forEach(mask => {
            mask.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });
    },

    navigateTo(pageId) {
        if (!document.getElementById(pageId)) return;

        if (this.currentPage !== pageId) {
            this.pageHistory.push(this.currentPage);
        }
        this.currentPage = pageId;

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');

        document.querySelectorAll('.dd-tab-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        document.getElementById('headerTitle').textContent = this.pageTitles[pageId] || '疫苗接种管理';

        const showBack = pageId !== 'page-dashboard';
        document.getElementById('headerBack').style.display = showBack ? 'flex' : 'none';

        const content = document.getElementById('mainContent');
        content.scrollTop = 0;

        switch (pageId) {
            case 'page-dashboard':
                this.updateDashboardStats();
                this.renderWarnings();
                this.renderActivities();
                break;
            case 'page-batch':
                BatchModule.render();
                break;
            case 'page-recall':
                RecallModule.render();
                break;
            case 'page-schedule':
                ScheduleModule.render();
                break;
            case 'page-waitlist':
                WaitlistModule.render();
                break;
        }
    },

    goBack() {
        if (this.pageHistory.length > 0) {
            const prevPage = this.pageHistory.pop();
            this.currentPage = prevPage;

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(prevPage).classList.add('active');

            document.querySelectorAll('.dd-tab-item').forEach(item => {
                item.classList.toggle('active', item.dataset.page === prevPage);
            });

            document.getElementById('headerTitle').textContent = this.pageTitles[prevPage] || '疫苗接种管理';
            const showBack = prevPage !== 'page-dashboard';
            document.getElementById('headerBack').style.display = showBack ? 'flex' : 'none';

            const content = document.getElementById('mainContent');
            content.scrollTop = 0;
        } else {
            this.navigateTo('page-dashboard');
        }
    },

    updateDashboardStats() {
        const batchCount = DataStore.data.vaccineBatches.length;
        const vaccinatedCount = DataStore.data.vaccinationRecords.filter(r => r.status === 'done').length;
        
        const today = Utils.getTodayStr();
        const todayAppointments = DataStore.data.appointments.filter(a => 
            a.date === today && a.status !== 'cancelled'
        ).length;

        const waitingCount = DataStore.data.waitlistEntries.filter(e => 
            e.status === 'waiting' || e.status === 'notified'
        ).length;

        const animateValue = (elementId, endValue) => {
            const el = document.getElementById(elementId);
            if (!el) return;
            const startValue = parseInt(el.textContent) || 0;
            const duration = 500;
            const startTime = performance.now();

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                const currentValue = Math.round(startValue + (endValue - startValue) * easeProgress);
                el.textContent = currentValue;
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);
        };

        animateValue('statBatchCount', batchCount);
        animateValue('statVaccinatedCount', vaccinatedCount);
        animateValue('statTodayAppointments', todayAppointments);
        animateValue('statWaitingCount', waitingCount);
    },

    renderWarnings() {
        const container = document.getElementById('warningList');
        const warnings = DataStore.getWarnings();

        if (warnings.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #52c41a; background: #fff; border-radius: 12px;">
                    ✅ 暂无预警，一切正常
                </div>
            `;
            return;
        }

        container.innerHTML = warnings.slice(0, 5).map(w => {
            const iconMap = {
                expire: { icon: '⏰', class: 'warning-expire', action: () => this.navigateTo('page-batch') },
                recall: { icon: '⚠️', class: 'warning-recall', action: () => this.navigateTo('page-recall') },
                timeout: { icon: '📅', class: 'warning-timeout', action: () => this.navigateTo('page-schedule') }
            };
            const info = iconMap[w.type] || iconMap.expire;

            return `
                <div class="warning-item" data-warning-id="${w.id}">
                    <div class="warning-icon ${info.class}">${info.icon}</div>
                    <div class="warning-content">
                        <div class="warning-title">${Utils.escapeHtml(w.title)}</div>
                        <div class="warning-desc">${Utils.escapeHtml(w.desc)}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.warning-item').forEach((item, idx) => {
            item.addEventListener('click', () => {
                const w = warnings[idx];
                const actionMap = {
                    expire: () => this.navigateTo('page-batch'),
                    recall: () => this.navigateTo('page-recall'),
                    timeout: () => this.navigateTo('page-schedule')
                };
                if (actionMap[w.type]) actionMap[w.type]();
            });
        });
    },

    renderActivities() {
        const container = document.getElementById('activityList');
        const activities = DataStore.data.activities;

        if (activities.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #999; background: #fff; border-radius: 12px;">
                    暂无动态
                </div>
            `;
            return;
        }

        container.innerHTML = activities.slice(0, 10).map(a => {
            const dotMap = {
                vaccine: 'dot-vaccine',
                register: 'dot-register',
                recall: 'dot-recall',
                notify: 'dot-notify'
            };

            return `
                <div class="activity-item">
                    <div class="activity-dot ${dotMap[a.type] || 'dot-vaccine'}"></div>
                    <div class="activity-content">
                        <div class="activity-text">${Utils.escapeHtml(a.text)}</div>
                        <div class="activity-time">${Utils.escapeHtml(a.time)}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    openNotificationDrawer() {
        this.renderNotifications();
        document.getElementById('notificationDrawer').classList.add('active');
    },

    closeNotificationDrawer() {
        document.getElementById('notificationDrawer').classList.remove('active');
    },

    renderNotifications() {
        const container = document.getElementById('notificationList');
        const notifications = [...DataStore.data.notifications].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        if (notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-tip" style="padding: 60px 20px;">暂无通知</div>
            `;
            return;
        }

        container.innerHTML = notifications.slice(0, 50).map(n => {
            const info = Utils.getNotificationTypeInfo(n.type);

            return `
                <div class="notification-item ${n.read ? '' : 'unread'}" data-notification-id="${n.id}">
                    <div class="notification-item-header">
                        <span class="notification-item-title">
                            <span class="notification-type-icon">${info.icon}</span>
                            ${Utils.escapeHtml(n.title)}
                        </span>
                        ${n.read ? '' : '<span class="notification-dot"></span>'}
                    </div>
                    <div class="notification-item-content">${Utils.escapeHtml(n.content)}</div>
                    <div class="notification-item-time">${Utils.formatDate(n.createdAt, 'YYYY-MM-DD HH:mm')}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const notificationId = item.dataset.notificationId;
                DataStore.markNotificationAsRead(notificationId);
                this.updateNotificationBadge();
                this.renderNotifications();
            });
        });
    },

    updateNotificationBadge() {
        const count = DataStore.getUnreadNotificationCount();
        const badge = document.getElementById('notificationBadge');
        if (count > 0) {
            badge.style.display = 'flex';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    },

    startTimeoutCheck() {
        const checkInterval = 60 * 1000;
        setInterval(() => {
            if (DataStore.releaseTimeoutAppointments() > 0) {
                ScheduleModule.render();
                WaitlistModule.render();
                this.updateDashboardStats();
                this.updateNotificationBadge();
                Utils.showToast('检测到超时预约，已自动释放', 'info', 3000);
            }
        }, checkInterval);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
    console.log('%c🐾 宠物医院疫苗接种管理系统', 'color:#1677ff;font-size:18px;font-weight:bold;');
    console.log('%c系统已启动 - 数据持久化到 localStorage', 'color:#52c41a;font-size:12px;');
});