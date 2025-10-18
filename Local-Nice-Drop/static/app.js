class NiceDropApp {
    constructor() {
        this.socket = null;
        this.deviceId = this.generateId();
        this.deviceName = "Мой компьютер";
        this.currentFile = null;
        this.targetPeer = null;
        this.availableDevices = new Map();
        this.pendingOffers = new Map();
        this.receivedFiles = new Map();
        this.chunkSize = 64 * 1024; // 64KB chunks для больших файлов
        
        this.init();
    }

    generateId() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async init() {
        this.loadSettings();
        document.getElementById('myId').textContent = this.deviceId;
        document.getElementById('currentDeviceName').textContent = this.deviceName;
        await this.connectWebSocket();
        this.setupEventListeners();
        this.updateUI();
        this.showNotification('Nice-Drop запущен!', 'success');
    }

    loadSettings() {
        const savedName = localStorage.getItem('niceDrop_deviceName');
        if (savedName) {
            this.deviceName = savedName;
        }
    }

    saveSettings() {
        localStorage.setItem('niceDrop_deviceName', this.deviceName);
    }

    setupEventListeners() {
        // Выбор файла
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Изменение имени устройства
        document.getElementById('deviceNameInput').addEventListener('input', (e) => {
            this.deviceName = e.target.value.trim() || "Мой компьютер";
            this.saveSettings();
            document.getElementById('currentDeviceName').textContent = this.deviceName;
            this.updateDeviceNameOnServer();
        });

        // Drag and drop
        const dropZone = document.querySelector('.file-label');
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#667eea';
                dropZone.style.background = '#f8f9ff';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#bdc3c7';
                dropZone.style.background = '#f8f9fa';
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files[0]) {
                this.handleFileSelect(files[0]);
            }
        }, false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async connectWebSocket() {
        try {
            this.socket = new WebSocket(`ws://${window.location.host}/ws/${this.deviceId}`);
            
            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error("Ошибка парсинга:", error);
                }
            };

            this.socket.onopen = () => {
                console.log("🔗 Подключено к серверу");
                this.updateConnectionStatus(true);
                this.updateDeviceNameOnServer();
            };

            this.socket.onclose = () => {
                console.log("🔌 Соединение закрыто");
                this.updateConnectionStatus(false);
                setTimeout(() => this.connectWebSocket(), 3000);
            };

        } catch (error) {
            console.error("Ошибка подключения:", error);
        }
    }

    updateConnectionStatus(connected) {
        const status = document.getElementById('statusText');
        if (connected) {
            status.textContent = 'Подключено';
            status.className = 'status-online';
        } else {
            status.textContent = 'Не подключено';
            status.className = 'status-offline';
        }
    }

    updateDeviceNameOnServer() {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'update_device_name',
                name: this.deviceName
            }));
        }
    }

    updateUI() {
        const sendBtn = document.getElementById('sendBtn');
        if (this.targetPeer && this.currentFile) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '🚀 Отправить файл';
        } else {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '⏳ Выберите устройство и файл';
        }
    }

    handleMessage(message) {
        console.log("📨 Получено:", message.type);
        
        switch(message.type) {
            case 'peers_list':
                this.handlePeersList(message.peers);
                break;
            case 'peers_updated':
                this.discoverPeers();
                break;
            case 'file_offer':
                this.handleFileOffer(message.from, message.from_name, message.file_info);
                break;
            case 'file_offer_sent':
                this.showNotification(`Запрос на отправку "${message.file_name}" отправлен`, 'info');
                break;
            case 'file_accepted':
                this.handleFileAccepted(message.file_name, message.to_name);
                break;
            case 'file_rejected':
                this.showNotification(`Файл "${message.file_name}" отклонен`, 'error');
                break;
            case 'file_chunk':
                this.handleFileChunk(message.chunk_data, message.file_name, message.chunk_index, message.total_chunks, message.from_name);
                break;
        }
    }

    discoverPeers() {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'discover_peers' }));
        }
    }

    handlePeersList(peers) {
        this.availableDevices.clear();
        peers.forEach(peer => {
            this.availableDevices.set(peer.id, peer);
        });
        
        this.updateDevicesList();
        
        if (peers.length > 0) {
            this.showNotification(`Найдено ${peers.length} устройств`, 'success');
        }
    }

    updateDevicesList() {
        const list = document.getElementById('peersList');
        list.innerHTML = '';

        if (this.availableDevices.size === 0) {
            list.innerHTML = '<div class="empty-state">Устройства не найдены</div>';
            return;
        }

        this.availableDevices.forEach((device, id) => {
            const element = document.createElement('div');
            element.className = 'peer-item';
            element.innerHTML = `
                <div class="peer-info">
                    <div class="peer-icon">📱</div>
                    <div class="peer-details">
                        <div class="peer-name">${device.name}</div>
                        <div class="peer-status">В сети</div>
                    </div>
                </div>
                <button onclick="app.selectDevice('${id}')" class="connect-btn">
                    📡 Выбрать
                </button>
            `;
            list.appendChild(element);
        });
    }

    selectDevice(deviceId) {
        this.targetPeer = deviceId;
        const device = this.availableDevices.get(deviceId);
        
        // Подсвечиваем выбранное устройство
        document.querySelectorAll('.peer-item').forEach(item => {
            item.classList.remove('selected');
        });
        event.target.closest('.peer-item').classList.add('selected');
        
        document.getElementById('connectedPeerId').textContent = device.name;
        document.getElementById('connectedPeer').classList.remove('hidden');
        
        this.showNotification(`Выбрано: ${device.name}`, 'success');
        this.updateUI();
    }

    handleFileSelect(file) {
        if (!file) return;

        this.currentFile = file;
        this.showFileInfo(file);
        this.updateUI();
        
        this.showNotification(`Файл "${file.name}" готов к отправке`, 'success');
    }

    showFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        fileInfo.innerHTML = `
            <div class="file-transfer">
                <div class="file-details">
                    <strong>${file.name}</strong>
                    <div>Размер: ${this.formatFileSize(file.size)}</div>
                </div>
                <button onclick="app.clearFile()" class="remove-btn">❌ Удалить</button>
            </div>
        `;
    }

    clearFile() {
        this.currentFile = null;
        document.getElementById('fileInfo').innerHTML = '';
        document.getElementById('fileInput').value = '';
        this.updateUI();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async sendFile() {
        if (!this.targetPeer || !this.currentFile) {
            this.showNotification('Выберите устройство и файл', 'error');
            return;
        }

        const fileInfo = {
            name: this.currentFile.name,
            size: this.currentFile.size,
            type: this.currentFile.type
        };

        this.socket.send(JSON.stringify({
            type: 'file_offer',
            target: this.targetPeer,
            file_info: fileInfo
        }));

        this.showNotification('Отправляем запрос...', 'info');
    }

    // Обработка входящих файлов
    handleFileOffer(from, fromName, fileInfo) {
        const offerId = `offer_${Date.now()}`;
        this.pendingOffers.set(offerId, { from, fromName, fileInfo });
        
        this.showIncomingFile(offerId, fromName, fileInfo);
        this.showNotification(`${fromName} хочет отправить файл`, 'info');
    }

    showIncomingFile(offerId, fromName, fileInfo) {
        const incomingFiles = document.getElementById('incomingFiles');
        const fileElement = document.createElement('div');
        fileElement.className = 'file-transfer';
        fileElement.innerHTML = `
            <div class="file-details">
                <strong>${fileInfo.name}</strong>
                <div>От: ${fromName} • ${this.formatFileSize(fileInfo.size)}</div>
            </div>
            <div class="file-actions">
                <button onclick="app.acceptFile('${offerId}')" class="download-btn">✅ Принять</button>
                <button onclick="app.rejectFile('${offerId}')" class="remove-btn">❌ Отклонить</button>
            </div>
        `;
        incomingFiles.appendChild(fileElement);
    }

    async acceptFile(offerId) {
        const offer = this.pendingOffers.get(offerId);
        if (!offer) return;

        // Отправляем подтверждение
        this.socket.send(JSON.stringify({
            type: 'file_accept',
            from: offer.from,
            file_name: offer.fileInfo.name
        }));

        // Удаляем из списка ожидания
        event.target.closest('.file-transfer').remove();
        this.pendingOffers.delete(offerId);

        this.showNotification(`Файл "${offer.fileInfo.name}" принят, ожидаем данные...`, 'info');
    }

    rejectFile(offerId) {
        const offer = this.pendingOffers.get(offerId);
        
        this.socket.send(JSON.stringify({
            type: 'file_reject',
            from: offer.from,
            file_name: offer.fileInfo.name
        }));

        // Удаляем из списка
        event.target.closest('.file-transfer').remove();
        this.pendingOffers.delete(offerId);

        this.showNotification(`Файл отклонен`, 'info');
    }

    handleFileAccepted(fileName, toName) {
        // Получатель принял файл - отправляем данные
        if (this.currentFile && this.targetPeer) {
            this.sendFileInChunks();
        }
    }

    async sendFileInChunks() {
        if (!this.currentFile || !this.targetPeer) return;

        const file = this.currentFile;
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        let chunkIndex = 0;

        this.showNotification(`Начинаем отправку файла "${file.name}"...`, 'info');

        const sendNextChunk = () => {
            if (chunkIndex >= totalChunks) {
                this.showNotification(`✅ Файл "${file.name}" успешно отправлен!`, 'success');
                this.clearFile();
                return;
            }

            const start = chunkIndex * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            const chunk = file.slice(start, end);

            const reader = new FileReader();
            reader.onload = (e) => {
                this.socket.send(JSON.stringify({
                    type: 'file_chunk',
                    target: this.targetPeer,
                    chunk_data: e.target.result,
                    file_name: file.name,
                    chunk_index: chunkIndex,
                    total_chunks: totalChunks
                }));

                chunkIndex++;
                
                // Отправляем следующий чанк с небольшой задержкой
                setTimeout(sendNextChunk, 10);
            };

            reader.onerror = (error) => {
                console.error("Ошибка чтения чанка:", error);
                this.showNotification('Ошибка отправки файла', 'error');
            };

            reader.readAsDataURL(chunk);
        };

        sendNextChunk();
    }

    handleFileChunk(chunkData, fileName, chunkIndex, totalChunks, fromName) {
        const fileId = fileName;
        
        if (!this.receivedFiles.has(fileId)) {
            // Создаем новый файл
            this.receivedFiles.set(fileId, {
                name: fileName,
                chunks: new Array(totalChunks),
                receivedCount: 0,
                fromName: fromName
            });
            
            this.showNotification(`Начинаем прием файла "${fileName}"...`, 'info');
        }

        const fileInfo = this.receivedFiles.get(fileId);
        fileInfo.chunks[chunkIndex] = chunkData;
        fileInfo.receivedCount++;

        // Показываем прогресс
        const progress = Math.round((fileInfo.receivedCount / totalChunks) * 100);
        this.updateFileProgress(fileId, progress);

        if (fileInfo.receivedCount === totalChunks) {
            // Все чанки получены - собираем файл
            this.assembleFile(fileId);
        }
    }

    updateFileProgress(fileId, progress) {
        let progressElement = document.getElementById(`progress-${fileId}`);
        
        if (!progressElement) {
            const incomingFiles = document.getElementById('incomingFiles');
            progressElement = document.createElement('div');
            progressElement.id = `progress-${fileId}`;
            progressElement.className = 'file-transfer progress';
            progressElement.innerHTML = `
                <div class="file-details">
                    <strong>${fileId}</strong>
                    <div>Загрузка: <span class="progress-text">${progress}%</span></div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
            incomingFiles.appendChild(progressElement);
        } else {
            const progressText = progressElement.querySelector('.progress-text');
            const progressFill = progressElement.querySelector('.progress-fill');
            progressText.textContent = `${progress}%`;
            progressFill.style.width = `${progress}%`;
        }
    }

    assembleFile(fileId) {
        const fileInfo = this.receivedFiles.get(fileId);
        const chunks = fileInfo.chunks;
        
        // Собираем все чанки в один Blob
        const blob = new Blob(chunks.map(chunk => {
            // Конвертируем dataURL обратно в binary
            const byteString = atob(chunk.split(',')[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return ab;
        }));

        // Создаем URL для скачивания
        const url = URL.createObjectURL(blob);
        fileInfo.downloadUrl = url;

        // Заменяем прогресс на готовый файл
        this.showReceivedFile(fileId);
        this.showNotification(`Файл "${fileInfo.name}" готов к скачиванию!`, 'success');
    }

    showReceivedFile(fileId) {
        const fileInfo = this.receivedFiles.get(fileId);
        const progressElement = document.getElementById(`progress-${fileId}`);
        
        if (progressElement) {
            progressElement.remove();
        }

        const incomingFiles = document.getElementById('incomingFiles');
        const fileElement = document.createElement('div');
        fileElement.className = 'file-transfer received';
        fileElement.innerHTML = `
            <div class="file-details">
                <strong>${fileInfo.name}</strong>
                <div>От: ${fileInfo.fromName}</div>
            </div>
            <div class="file-actions">
                <button onclick="app.downloadFile('${fileId}')" class="download-btn">💾 Скачать</button>
                <button onclick="app.removeReceivedFile('${fileId}')" class="remove-btn">❌ Удалить</button>
            </div>
        `;
        incomingFiles.appendChild(fileElement);
    }

    downloadFile(fileId) {
        const fileInfo = this.receivedFiles.get(fileId);
        if (!fileInfo || !fileInfo.downloadUrl) return;

        const link = document.createElement('a');
        link.href = fileInfo.downloadUrl;
        link.download = fileInfo.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showNotification(`Файл "${fileInfo.name}" скачан`, 'success');
    }

    removeReceivedFile(fileId) {
        const fileInfo = this.receivedFiles.get(fileId);
        if (fileInfo && fileInfo.downloadUrl) {
            URL.revokeObjectURL(fileInfo.downloadUrl);
        }
        this.receivedFiles.delete(fileId);
        
        const element = document.querySelector(`[onclick="app.downloadFile('${fileId}')"]`)?.closest('.file-transfer');
        if (element) {
            element.remove();
        }
        this.showNotification('Файл удален', 'info');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#1abc9c' : '#3498db'};
            color: white;
            border-radius: 10px;
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Глобальные функции
function discoverPeers() {
    app.discoverPeers();
}

function sendFile() {
    app.sendFile();
}

function copyId() {
    const id = document.getElementById('myId').textContent;
    navigator.clipboard.writeText(id).then(() => {
        app.showNotification('ID скопирован в буфер!', 'success');
    });
}

function changeDeviceName() {
    const newName = prompt('Введите новое имя устройства:', app.deviceName);
    if (newName && newName.trim()) {
        app.deviceName = newName.trim();
        app.saveSettings();
        document.getElementById('currentDeviceName').textContent = app.deviceName;
        app.updateDeviceNameOnServer();
        app.showNotification(`Имя устройства изменено на: ${app.deviceName}`, 'success');
    }
}

// Инициализация приложения
const app = new NiceDropApp();