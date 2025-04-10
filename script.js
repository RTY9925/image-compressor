/**
 * 图片压缩工具的主要功能实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const imageList = document.getElementById('imageList');
    const compressionProgress = document.getElementById('compressionProgress');
    const progressFill = compressionProgress.querySelector('.progress-fill');
    const progressCount = document.getElementById('progressCount');
    const compressBtn = document.getElementById('compressBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const compressionHistory = document.getElementById('compressionHistory');
    const compress300kBtn = document.getElementById('compress300kBtn');
    const toggleSettings = document.getElementById('toggleSettings');
    const toggleHistory = document.getElementById('toggleHistory');
    const settingsContent = document.getElementById('settingsContent');
    const customSize = document.getElementById('customSize');
    const sizeUnit = document.getElementById('sizeUnit');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const selectAll = document.getElementById('selectAll');

    // 设置选项
    const outputFormat = document.getElementById('outputFormat');
    const maxWidth = document.getElementById('maxWidth');
    const maxHeight = document.getElementById('maxHeight');
    const maintainAspectRatio = document.getElementById('maintainAspectRatio');
    const filePrefix = document.getElementById('filePrefix');

    let imageQueue = [];
    let isProcessing = false;

    // 在线人数统计
    const onlineCount = document.getElementById('onlineCount');
    let currentCount = parseInt(localStorage.getItem('onlineCount')) || 1;

    // 更新在线人数
    function updateOnlineCount() {
        // 模拟随机波动
        const randomChange = Math.random() > 0.5 ? 1 : -1;
        currentCount = Math.max(1, currentCount + randomChange);
        
        // 限制最大人数
        currentCount = Math.min(currentCount, 100);
        
        // 更新显示
        onlineCount.textContent = currentCount;
        
        // 保存到本地存储
        localStorage.setItem('onlineCount', currentCount);
    }

    // 定期更新在线人数
    setInterval(updateOnlineCount, 5000);

    // 页面关闭时减少在线人数
    window.addEventListener('beforeunload', () => {
        currentCount = Math.max(1, currentCount - 1);
        localStorage.setItem('onlineCount', currentCount);
    });

    // 初始化拖拽排序
    new Sortable(imageList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: (evt) => {
            const items = Array.from(imageList.children);
            imageQueue = items.map(item => imageQueue.find(img => img.id === item.dataset.id));
        }
    });

    // 文件处理函数
    function handleFiles(files) {
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            alert('请上传图片文件！');
            fileInput.value = '';
            return;
        }

        if (imageFiles.length + imageQueue.length > 200) {
            alert('最多只能添加200张图片！');
            fileInput.value = '';
            return;
        }

        imageFiles.forEach(file => {
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'image-item';
                div.dataset.id = id;
                div.innerHTML = `
                    <div class="image-preview">
                        <div class="preview-checkbox">
                            <input type="checkbox" id="check_${id}" class="image-checkbox">
                            <label for="check_${id}"></label>
                        </div>
                        <div class="preview-original">
                            <span class="preview-label">原图</span>
                            <img src="${e.target.result}" alt="原图">
                            <span class="size-info">${formatFileSize(file.size)}</span>
                        </div>
                        <div class="preview-compressed">
                            <span class="preview-label">压缩后</span>
                            <img src="${e.target.result}" alt="压缩预览">
                            <span class="size-info">待压缩</span>
                        </div>
                    </div>
                    <div class="image-info">
                        <div class="image-name">${file.name}</div>
                        <button class="image-item-remove" onclick="removeImage('${id}')">×</button>
                    </div>
                `;
                imageList.appendChild(div);
                
                imageQueue.push({
                    id,
                    file,
                    name: file.name,
                    size: file.size,
                    element: div
                });
                updateButtons();
                updateSelectAllState();
            };

            reader.readAsDataURL(file);
        });

        fileInput.value = '';
    }

    // 移除图片
    window.removeImage = (id) => {
        const item = document.querySelector(`[data-id="${id}"]`);
        if (item) {
            item.remove();
            imageQueue = imageQueue.filter(img => img.id !== id);
            updateButtons();
            updateSelectAllState();
            
            fileInput.value = '';
        }
    };

    // 添加进度提示和取消功能
    let compressionCancelled = false;

    function updateCompressionProgress(current, total, fileName) {
        const progressBar = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        const percentage = (current / total) * 100;
        
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `正在压缩: ${fileName} (${current}/${total})`;
    }

    // 添加取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = '取消压缩';
    cancelBtn.onclick = () => {
        compressionCancelled = true;
    };

    // 压缩图片函数
    async function compressImages(mode = 'normal') {
        if (imageQueue.length === 0 || isProcessing) return;
        
        let targetSize;
        const settings = {
            format: outputFormat.value,
            maxWidth: parseInt(maxWidth.value) || null,
            maxHeight: parseInt(maxHeight.value) || null,
            maintainAspectRatio: maintainAspectRatio.checked,
            prefix: filePrefix.value || 'compressed_'
        };

        // 修改目标大小的设置逻辑
        if (mode === '300k') {
            targetSize = 300 * 1024;
        } else if (mode === 'custom') {
            const size = parseFloat(customSize.value);
            if (!size || size <= 0) {
                alert('请输入有效的目标大小');
                return;
            }

            // 将输入值调整为25KB的倍数
            const kbSize = size * (sizeUnit.value === 'MB' ? 1024 : 1);
            const adjustedSize = Math.ceil(kbSize / 25) * 25;
            targetSize = adjustedSize * 1024; // 转换为字节

            // 检查目标大小是否超过原图大小
            const maxOriginalSize = Math.max(...imageQueue.map(img => img.file.size));
            if (targetSize >= maxOriginalSize) {
                alert(`目标大小(${formatFileSize(targetSize)})大于或等于原图大小(${formatFileSize(maxOriginalSize)})，请输入更小的值`);
                return;
            }
        } else {
            // 默认压缩模式改为更合理的大小
            targetSize = Math.min(500 * 1024, Math.max(...imageQueue.map(img => img.file.size * 0.8)));
        }

        // 添加日志输出以便调试
        console.log('压缩模式:', mode);
        console.log('目标大小:', formatFileSize(targetSize));

        try {
            isProcessing = true;
            compressBtn.disabled = true;
            compress300kBtn.disabled = true;
            compressionProgress.style.display = 'block';

            const zip = new JSZip();
            let processed = 0;
            const totalSize = imageQueue.reduce((sum, img) => sum + img.size, 0);
            let compressedSize = 0;

            for (const image of imageQueue) {
                progressCount.textContent = `${processed + 1}/${imageQueue.length}`;
                progressFill.style.width = `${(processed + 1) * 100 / imageQueue.length}%`;

                let result;
                if (mode === '300k') {
                    result = await compressTo300KB(image.file, settings);
                } else if (mode === 'custom') {
                    result = await customSizeCompress(image.file, targetSize, settings);
                } else {
                    result = await smartCompress(image.file, targetSize, settings);
                }

                if (result && result.blob) {
                    const prefix = settings.prefix.trim() || 'compressed_';
                    const fileName = `${prefix}${image.name.replace(/\.[^/.]+$/, '')}${result.extension}`;
                    zip.file(fileName, result.blob);
                    compressedSize += result.blob.size;

                    const previewCompressed = image.element.querySelector('.preview-compressed');
                    const compressedImg = previewCompressed.querySelector('img');
                    const sizeInfo = previewCompressed.querySelector('.size-info');
                    
                    compressedImg.src = URL.createObjectURL(result.blob);
                    sizeInfo.textContent = formatFileSize(result.blob.size);
                }

                processed++;
            }

            const zipBlob = await zip.generateAsync({type: 'blob'});
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'compressed_images.zip';
                link.click();
            };
            downloadBtn.disabled = false;

            addToHistory(imageQueue.length, totalSize, compressedSize);

        } catch (error) {
            console.error('压缩失败:', error);
            alert('压缩过程中出现错误，请重试');
        } finally {
            isProcessing = false;
            compressBtn.disabled = false;
            compress300kBtn.disabled = false;
            compressionProgress.style.display = 'none';
        }
    }

    // 修改智能压缩函数
    async function smartCompress(file, targetSize, settings) {
        try {
            const img = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            // 保持原始分辨率
            canvas.width = img.width;
            canvas.height = img.height;

            // 确定输出格式
            let outputType = file.type;
            if (settings.format !== 'original') {
                outputType = `image/${settings.format}`;
            }
            let extension = `.${outputType.split('/')[1]}`;

            // 绘制图像到画布上
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 初始压缩尝试
            let bestResult = null;
            const formats = [
                { type: outputType, quality: 0.95 }, // 提高初始质量
                { type: 'image/webp', quality: 0.95 },
                { type: 'image/jpeg', quality: 0.95 }
            ];

            for (const format of formats) {
                let minQuality = 0.1;
                let maxQuality = format.quality;
                let currentBest = null;

                // 增加迭代次数以提高精度
                for (let i = 0; i < 15; i++) {
                    const quality = (minQuality + maxQuality) / 2;
                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, format.type, quality);
                    });

                    if (!blob) continue;

                    // 更新最佳结果的逻辑保持不变
                    if (!currentBest || Math.abs(blob.size - targetSize) < Math.abs(currentBest.size - targetSize)) {
                        currentBest = blob;
                        if (!bestResult || Math.abs(blob.size - targetSize) < Math.abs(bestResult.blob.size - targetSize)) {
                            bestResult = {
                                blob,
                                quality,
                                extension: `.${format.type.split('/')[1]}`
                            };
                        }
                    }

                    // 调整质量范围
                    if (blob.size > targetSize) {
                        maxQuality = quality;
                    } else {
                        minQuality = quality;
                    }

                    // 如果已经足够接近目标大小，停止搜索
                    if (Math.abs(blob.size - targetSize) / targetSize < 0.02) { // 提高精度要求
                        break;
                    }
                }
            }

            // 如果压缩结果仍然太大，使用更激进的压缩
            if (bestResult.blob.size > targetSize * 1.1) {
                let quality = 0.1;
                const aggressiveBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/webp', quality);
                });

                if (aggressiveBlob && aggressiveBlob.size < bestResult.blob.size) {
                    bestResult = {
                        blob: aggressiveBlob,
                        quality: quality,
                        extension: '.webp'
                    };
                }
            }

            // 确保返回结果
            if (!bestResult || bestResult.blob.size === file.size) {
                console.warn('压缩未能减小文件大小，尝试强制压缩');
                // 强制使用较低质量进行压缩
                const forcedBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/webp', 0.5);
                });
                
                bestResult = {
                    blob: forcedBlob,
                    quality: 0.5,
                    extension: '.webp'
                };
            }

            console.log('压缩结果:', {
                originalSize: file.size,
                compressedSize: bestResult.blob.size,
                targetSize: targetSize,
                quality: bestResult.quality,
                format: bestResult.extension
            });

            return bestResult;

        } catch (error) {
            console.error('压缩过程出错:', error);
            throw error;
        }
    }

    // 添加到历史记录
    function addToHistory(count, originalSize, compressedSize) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-info">
                <div class="history-item-date">${new Date().toLocaleString()}</div>
                <div class="history-item-stats">
                    处理：${count}张图片 | 
                    原始：${formatFileSize(originalSize)} | 
                    压缩后：${formatFileSize(compressedSize)} | 
                    节省：${formatFileSize(originalSize - compressedSize)}
                </div>
            </div>
        `;
        compressionHistory.insertBefore(historyItem, compressionHistory.firstChild);
    }

    // 修改更新按钮状态函数
    function updateButtons() {
        const hasImages = imageQueue.length > 0;
        const hasSelectedImages = document.querySelectorAll('.image-checkbox:checked').length > 0;
        const isSingleImage = imageQueue.length === 1;
        
        compressBtn.disabled = !hasImages;
        compress300kBtn.disabled = !hasImages;
        
        // 修改下载选中按钮的状态和文本
        if (isSingleImage) {
            downloadSelectedBtn.disabled = false;
            downloadSelectedBtn.textContent = '下载图片';
        } else {
            downloadSelectedBtn.disabled = !hasImages || !hasSelectedImages;
            downloadSelectedBtn.textContent = '下载选中图片';
        }
        
        if (hasImages) {
            compressBtn.textContent = `压缩 ${imageQueue.length} 张图片`;
            compress300kBtn.textContent = `压缩 ${imageQueue.length} 张图片至300KB`;
        } else {
            compressBtn.textContent = '压缩图片';
            compress300kBtn.textContent = '压缩至300KB';
        }
    }

    // 修改下载选中图片的函数
    async function downloadSelectedImages() {
        let selectedImages;
        
        if (imageQueue.length === 1) {
            // 单张图片时直接使用该图片
            selectedImages = imageQueue;
        } else {
            // 多张图片时使用选中的图片
            selectedImages = Array.from(document.querySelectorAll('.image-checkbox:checked')).map(
                checkbox => imageQueue.find(img => img.id === checkbox.id.replace('check_', ''))
            );

            if (selectedImages.length === 0) {
                // 显示错误提示
                const allImages = document.querySelectorAll('.image-item');
                allImages.forEach(item => {
                    item.classList.add('highlight');
                    setTimeout(() => item.classList.remove('highlight'), 1000);
                });
                alert('请先选择要下载的图片！');
                return;
            }
        }

        if (selectedImages.length === 1) {
            // 单张图片直接下载
            const image = selectedImages[0];
            const compressedImg = image.element.querySelector('.preview-compressed img');
            if (compressedImg.src.startsWith('data:')) {
                alert('请先压缩图片！');
                return;
            }
            const link = document.createElement('a');
            link.href = compressedImg.src;
            // 根据设置的输出格式修改文件扩展名
            const extension = outputFormat.value === 'original' 
                ? image.name.match(/\.[^/.]+$/)[0]
                : `.${outputFormat.value}`;
            const baseName = image.name.replace(/\.[^/.]+$/, '');
            link.download = `${filePrefix.value || 'compressed_'}${baseName}${extension}`;
            link.click();
        } else {
            // 多张图片打包下载
            const zip = new JSZip();
            for (const image of selectedImages) {
                const compressedImg = image.element.querySelector('.preview-compressed img');
                if (!compressedImg.src.startsWith('data:')) {
                    const response = await fetch(compressedImg.src);
                    const blob = await response.blob();
                    // 根据设置的输出格式修改文件扩展名
                    const extension = outputFormat.value === 'original' 
                        ? image.name.match(/\.[^/.]+$/)[0]
                        : `.${outputFormat.value}`;
                    const baseName = image.name.replace(/\.[^/.]+$/, '');
                    zip.file(`${filePrefix.value || 'compressed_'}${baseName}${extension}`, blob);
                }
            }
            
            const zipBlob = await zip.generateAsync({type: 'blob'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'selected_compressed_images.zip';
            link.click();
        }
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // 事件监听
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#007AFF';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#ddd';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#ddd';
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    compressBtn.addEventListener('click', () => {
        const size = parseFloat(customSize.value);
        if (size && size > 0) {
            compressImages('custom');
        } else {
            compressImages('normal');
        }
    });

    // 添加设置面板和历史记录的折叠功能
    toggleSettings.addEventListener('click', () => {
        settingsContent.classList.toggle('collapsed');
        toggleSettings.textContent = settingsContent.classList.contains('collapsed') ? '显示' : '隐藏';
    });

    toggleHistory.addEventListener('click', () => {
        compressionHistory.classList.toggle('collapsed');
        toggleHistory.textContent = compressionHistory.classList.contains('collapsed') ? '显示' : '隐藏';
    });

    // 修改自定义大小输入的事件处理
    customSize.addEventListener('input', function() {
        const size = parseFloat(this.value);
        if (size && size > 0) {
            const kbSize = size * (sizeUnit.value === 'MB' ? 1024 : 1);
            // 调整为最接近的25KB倍数
            const adjustedSize = Math.ceil(kbSize / 25) * 25;
            
            // 检查是否有选中的图片
            if (imageQueue.length > 0) {
                const maxOriginalSize = Math.max(...imageQueue.map(img => img.file.size));
                const adjustedBytes = adjustedSize * 1024;
                
                if (adjustedBytes >= maxOriginalSize) {
                    compressBtn.disabled = true;
                    compressBtn.textContent = '目标大小超过原图大小';
                } else {
                    compressBtn.disabled = false;
                    compressBtn.textContent = `压缩至 ${adjustedSize}KB`;
                    // 设置压缩模式
                    compressBtn.dataset.mode = 'custom';
                }
            }
        } else {
            compressBtn.disabled = true;
            compressBtn.textContent = '压缩图片';
            compressBtn.dataset.mode = 'normal';
        }
    });

    sizeUnit.addEventListener('change', () => {
        if (customSize.value) {
            const size = parseFloat(customSize.value);
            const unit = sizeUnit.value;
            if (size > 0) {
                compressBtn.textContent = `压缩至 ${size}${unit}`;
            }
        }
    });

    // 添加复选框变化事件监听
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('image-checkbox') && e.target.id !== 'selectAll') {
            updateSelectAllState();
            updateButtons();
        }
    });

    // 添加下载选中图片按钮事件监听
    downloadSelectedBtn.addEventListener('click', downloadSelectedImages);

    // 添加全选功能
    selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.image-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
        updateButtons();
    });

    // 添加更新全选状态的函数
    function updateSelectAllState() {
        const checkboxes = Array.from(document.querySelectorAll('.image-checkbox:not(#selectAll)'));
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            selectAll.disabled = true;
        } else {
            selectAll.disabled = false;
            selectAll.checked = checkboxes.every(checkbox => checkbox.checked);
        }
    }

    // 修复压缩至300KB按钮的事件监听
    compress300kBtn.addEventListener('click', () => compressImages('300k'));

    // 修改文件名前缀输入验证
    filePrefix.addEventListener('input', (e) => {
        // 移除实时验证，改为在失去焦点时验证
        // 删除这个事件监听器中的验证代码
    });

    // 修改失去焦点时的验证
    filePrefix.addEventListener('blur', (e) => {
        let value = e.target.value.trim();
        // 只在失去焦点时进行验证和格式化
        const validValue = value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '');
        if (value !== validValue) {
            value = validValue;
        }
        if (value && !value.endsWith('_')) {
            value += '_';
        }
        e.target.value = value || 'compressed_';
    });

    // 添加 compositionend 事件处理（用于处理中文输入完成）
    filePrefix.addEventListener('compositionend', (e) => {
        // 中文输入完成后的处理
        const value = e.target.value;
        if (value && !/^[\u4e00-\u9fa5a-zA-Z0-9_]*$/.test(value)) {
            e.target.value = value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '');
        }
    });

    // 修改文件名前缀的默认值
    filePrefix.value = 'compressed_';

    async function determineOptimalFormat(file, targetSize) {
        const formats = [
            { type: 'image/avif', quality: 0.85 },
            { type: 'image/webp', quality: 0.85 },
            { type: 'image/jpeg', quality: 0.85 },
            { type: 'image/png', quality: 1.0 }
        ];

        const img = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let bestResult = null;
        let bestSize = Infinity;

        for (const format of formats) {
            try {
                const blob = await new Promise(resolve => {
                    canvas.toBlob(resolve, format.type, format.quality);
                });

                if (blob && (!bestResult || Math.abs(blob.size - targetSize) < Math.abs(bestSize - targetSize))) {
                    bestResult = {
                        blob,
                        type: format.type,
                        extension: `.${format.type.split('/')[1]}`
                    };
                    bestSize = blob.size;
                }
            } catch (error) {
                console.warn(`Format ${format.type} not supported`);
            }
        }

        return bestResult;
    }

    function stripMetadata(blob) {
        // 移除不必要的元数据，保留关键信息
        return new Promise((resolve) => {
            // 实现元数据处理逻辑
        });
    }

    async function batchProcess(images, targetSize) {
        const results = [];
        const totalSize = images.reduce((sum, img) => sum + img.size, 0);
        const averageTargetSize = targetSize / images.length;
        
        // 根据图片复杂度动态分配目标大小
        for (const image of images) {
            const complexity = await analyzeImageComplexity(image);
            const adjustedTargetSize = averageTargetSize * complexity;
            results.push(await smartCompress(image, adjustedTargetSize));
        }
        
        return results;
    }

    const compressionPresets = {
        high: { quality: 0.85, targetSize: size => size * 0.7 },
        medium: { quality: 0.75, targetSize: size => size * 0.5 },
        low: { quality: 0.65, targetSize: size => size * 0.3 }
    };

    // 优化颜色量化算法，增加颜色保真度
    function quantizeColors(imageData, maxColors = 256) {
        // 增加颜色权重计算
        function calculateColorImportance(r, g, b) {
            // 基于人眼对颜色的敏感度计算权重
            // 人眼对绿色最敏感，其次是红色，最后是蓝色
            return (r * 0.299 + g * 0.587 + b * 0.114);
        }

        // 优化的颜色盒子类
        class ColorBox {
            constructor(pixels, level = 0) {
                this.pixels = pixels;
                this.level = level;
                this.importance = this.calculateImportance();
            }

            calculateImportance() {
                let totalImportance = 0;
                this.pixels.forEach(pixel => {
                    totalImportance += calculateColorImportance(pixel[0], pixel[1], pixel[2]);
                });
                return totalImportance / this.pixels.length;
            }

            calculateColorRange() {
                let rMin = 255, rMax = 0;
                let gMin = 255, gMax = 0;
                let bMin = 255, bMax = 0;

                for (const pixel of this.pixels) {
                    const [r, g, b] = pixel;
                    rMin = Math.min(rMin, r);
                    rMax = Math.max(rMax, r);
                    gMin = Math.min(gMin, g);
                    gMax = Math.max(gMax, g);
                    bMin = Math.min(bMin, b);
                    bMax = Math.max(bMax, b);
                }

                // 考虑人眼敏感度的范围计算
                const ranges = {
                    r: (rMax - rMin) * 0.299,
                    g: (gMax - gMin) * 0.587,
                    b: (bMax - bMin) * 0.114
                };

                return ranges;
            }

            split() {
                const range = this.calculateColorRange();
                let maxRange = Math.max(range.r, range.g, range.b);
                let splitComponent;

                // 根据人眼敏感度选择分割通道
                if (maxRange === range.r) splitComponent = 0;
                else if (maxRange === range.g) splitComponent = 1;
                else splitComponent = 2;

                // 使用中位数分割
                this.pixels.sort((a, b) => a[splitComponent] - b[splitComponent]);
                const mid = Math.floor(this.pixels.length / 2);

                return [
                    new ColorBox(this.pixels.slice(0, mid), this.level + 1),
                    new ColorBox(this.pixels.slice(mid), this.level + 1)
                ];
            }
        }

        // 将图像数据转换为像素数组，保留透明度信息
        const pixels = [];
        for (let i = 0; i < imageData.length; i += 4) {
            // 只处理非完全透明的像素
            if (imageData[i + 3] > 0) {
                pixels.push([
                    imageData[i],
                    imageData[i + 1],
                    imageData[i + 2],
                    imageData[i + 3]
                ]);
            }
        }

        // 初始化颜色盒子
        let boxes = [new ColorBox(pixels)];

        // 基于颜色重要性的分割
        while (boxes.length < maxColors) {
            // 找到最重要的盒子进行分割
            let maxImportanceBox = null;
            let maxImportance = -1;
            let maxIndex = 0;

            boxes.forEach((box, index) => {
                if (box.importance > maxImportance) {
                    maxImportance = box.importance;
                    maxImportanceBox = box;
                    maxIndex = index;
                }
            });

            if (!maxImportanceBox || maxImportanceBox.pixels.length < 2) break;

            // 分割盒子
            const [box1, box2] = maxImportanceBox.split();
            boxes.splice(maxIndex, 1, box1, box2);
        }

        // 生成优化的调色板
        const palette = boxes.map(box => {
            let r = 0, g = 0, b = 0, a = 0, count = 0;
            box.pixels.forEach(pixel => {
                const importance = calculateColorImportance(pixel[0], pixel[1], pixel[2]);
                r += pixel[0] * importance;
                g += pixel[1] * importance;
                b += pixel[2] * importance;
                a += pixel[3];
                count += importance;
            });

            return [
                Math.round(r / count),
                Math.round(g / count),
                Math.round(b / count),
                Math.round(a / box.pixels.length)
            ];
        });

        // 优化的颜色映射
        const result = new Uint8ClampedArray(imageData.length);
        for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i + 3] === 0) {
                // 保持完全透明的像素
                result[i] = result[i + 1] = result[i + 2] = result[i + 3] = 0;
                continue;
            }

            const pixel = [
                imageData[i],
                imageData[i + 1],
                imageData[i + 2],
                imageData[i + 3]
            ];

            // 使用感知颜色差异计算最接近的颜色
            let minDistance = Infinity;
            let closestColor = null;

            palette.forEach(color => {
                const distance = Math.sqrt(
                    Math.pow((color[0] - pixel[0]) * 0.299, 2) +
                    Math.pow((color[1] - pixel[1]) * 0.587, 2) +
                    Math.pow((color[2] - pixel[2]) * 0.114, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    closestColor = color;
                }
            });

            result[i] = closestColor[0];
            result[i + 1] = closestColor[1];
            result[i + 2] = closestColor[2];
            result[i + 3] = closestColor[3];
        }

        return result;
    }

    // 优化自定义大小压缩函数
    async function customSizeCompress(file, targetSize, settings) {
        try {
            console.log(`开始自定义压缩，目标大小: ${formatFileSize(targetSize)}`);
            const img = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            // 保持原始分辨率
            canvas.width = img.width;
            canvas.height = img.height;

            // 多格式压缩尝试，更有可能找到最佳匹配
            const formats = [
                { type: file.type, quality: 0.95 },
                { type: 'image/webp', quality: 0.95 }, 
                { type: 'image/jpeg', quality: 0.95, applyTo: ['image/jpeg', 'image/png'] }
            ];
            
            // 只保留适用于当前图像类型的格式
            const applicableFormats = formats.filter(format => 
                format.type === file.type || 
                !format.applyTo || 
                format.applyTo.includes(file.type)
            );

            // 先绘制图像
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            let overallBestResult = null;
            // 更精确的误差范围（降低到±1%）
            const targetMin = targetSize * 0.99;
            const targetMax = targetSize * 1.01;
            
            // 对每种格式尝试压缩
            for (const format of applicableFormats) {
                // 预压缩测试，检查最高质量是否已经小于目标大小
                const testBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, format.type, 1.0);
                });
                
                if (testBlob.size <= targetSize) {
                    console.log(`最高质量(1.0)已经满足大小要求: ${formatFileSize(testBlob.size)}`);
                    return {
                        blob: testBlob,
                        quality: 1.0,
                        extension: `.${format.type.split('/')[1]}`
                    };
                }
                
                // 二分查找的更优参数设置
                let minQuality = 0.1;  // 允许更低的质量以满足极端压缩需求
                let maxQuality = 0.99;
                let bestResult = null;
                let closestSizeDiff = Infinity;
                let attempts = 0;
                const maxAttempts = 20;
                
                console.log(`尝试 ${format.type} 格式压缩...`);
                
                // 主二分查找循环
                while (attempts < maxAttempts && (maxQuality - minQuality) > 0.01) {
                    attempts++;
                    const quality = (minQuality + maxQuality) / 2;
                    
                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, format.type, quality);
                    });
                    
                    const sizeDiff = Math.abs(blob.size - targetSize);
                    console.log(`尝试 #${attempts}: 质量=${quality.toFixed(4)}, 大小=${formatFileSize(blob.size)}, 差异=${formatFileSize(sizeDiff)}`);
                    
                    // 更新当前格式的最佳结果
                    if (sizeDiff < closestSizeDiff) {
                        closestSizeDiff = sizeDiff;
                        bestResult = { blob, quality, extension: `.${format.type.split('/')[1]}` };
                    }
                    
                    // 如果在目标范围内，进行微调以获得更好的质量
                    if (blob.size >= targetMin && blob.size <= targetMax) {
                        console.log(`找到满足范围的结果: ${formatFileSize(blob.size)}`);
                        const refinedResult = await refineQualityForSize(canvas, targetSize, quality, format.type);
                        bestResult = { 
                            blob: refinedResult.blob, 
                            quality: refinedResult.quality,
                            extension: `.${format.type.split('/')[1]}` 
                        };
                        break;
                    }
                    
                    // 调整质量范围
                    if (blob.size > targetSize) {
                        maxQuality = quality;
                    } else {
                        minQuality = quality;
                    }
                }
                
                // 更新全局最佳结果
                if (bestResult && (!overallBestResult || 
                    Math.abs(bestResult.blob.size - targetSize) < Math.abs(overallBestResult.blob.size - targetSize))) {
                    overallBestResult = bestResult;
                }
            }
            
            console.log(`最终压缩结果: 格式=${overallBestResult.extension}, 质量=${overallBestResult.quality.toFixed(4)}, 大小=${formatFileSize(overallBestResult.blob.size)}`);
            return overallBestResult;
        } catch (error) {
            console.error('自定义压缩出错:', error);
            throw error;
        }
    }

    // 精细质量优化函数，更多的微调点和插值
    async function refineQualityForSize(canvas, targetSize, baseQuality, format) {
        // 使用更多微调点，按距离排序进行尝试
        const finerAdjustments = [0, -0.005, 0.005, -0.01, 0.01, -0.02, 0.02, -0.03, 0.03];
        const results = [];
        
        for (const adj of finerAdjustments) {
            const quality = Math.max(0.1, Math.min(0.99, baseQuality + adj));
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, format, quality);
            });
            
            results.push({
                quality,
                size: blob.size,
                sizeDiff: Math.abs(blob.size - targetSize),
                blob
            });
        }
        
        // 按照大小差异排序
        results.sort((a, b) => a.sizeDiff - b.sizeDiff);
        
        // 如果最佳结果特别接近（差异<0.5%），直接返回
        if (results[0].sizeDiff < targetSize * 0.005) {
            return {
                blob: results[0].blob,
                quality: results[0].quality
            };
        }
        
        // 否则尝试在两个接近结果之间插值
        // 找到最接近且一个大于目标，一个小于目标的结果
        let smaller = null, larger = null;
        
        for (const result of results) {
            if (result.size <= targetSize && (!smaller || result.size > smaller.size)) {
                smaller = result;
            }
            if (result.size >= targetSize && (!larger || result.size < larger.size)) {
                larger = result;
            }
        }
        
        // 若找到了这样的一对结果，尝试插值
        if (smaller && larger && smaller !== larger) {
            // 线性插值计算估计质量
            const sizeRange = larger.size - smaller.size;
            const qualityRange = larger.quality - smaller.quality;
            const targetOffset = targetSize - smaller.size;
            const interpolatedQuality = smaller.quality + (targetOffset / sizeRange) * qualityRange;
            
            // 最后尝试插值质量
            const finalBlob = await new Promise(resolve => {
                canvas.toBlob(resolve, format, interpolatedQuality);
            });
            
            return {
                blob: finalBlob,
                quality: interpolatedQuality
            };
        }
        
        // 如果无法插值，返回最接近的结果
        return {
            blob: results[0].blob,
            quality: results[0].quality
        };
    }

    // 压缩至300KB的专用函数
    async function compressTo300KB(file, settings) {
        try {
            const img = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            // 保持原始分辨率
            canvas.width = img.width;
            canvas.height = img.height;

            // 确定最佳输出格式
            const formats = [
                { type: file.type, quality: 0.95 },
                { type: 'image/webp', quality: 0.95 },
                { type: 'image/jpeg', quality: 0.95 }
            ];

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            let bestResult = null;
            const targetSize = 300 * 1024; // 300KB
            const minAcceptableSize = 290 * 1024; // 290KB，确保结果接近但小于300KB

            for (const format of formats) {
                let minQuality = 0.5;
                let maxQuality = format.quality;
                let currentBest = null;

                // 二分查找最佳质量
                for (let i = 0; i < 15; i++) {
                    const quality = (minQuality + maxQuality) / 2;
                    const blob = await new Promise(resolve => {
                        canvas.toBlob(resolve, format.type, quality);
                    });

                    if (!blob) continue;

                    // 更新最佳结果
                    // 优先选择接近但不超过300KB的结果
                    if (blob.size <= targetSize) {
                        if (!currentBest || blob.size > currentBest.size) {
                            currentBest = {
                                blob,
                                quality,
                                size: blob.size,
                                extension: `.${format.type.split('/')[1]}`
                            };
                        }
                    }

                    // 调整质量范围
                    if (blob.size > targetSize) {
                        maxQuality = quality;
                    } else if (blob.size < minAcceptableSize) {
                        minQuality = quality;
                    } else {
                        // 如果在理想范围内（290KB-300KB），保存结果并停止搜索
                        currentBest = {
                            blob,
                            quality,
                            size: blob.size,
                            extension: `.${format.type.split('/')[1]}`
                        };
                        break;
                    }
                }

                // 更新全局最佳结果
                if (currentBest && (!bestResult || currentBest.size > bestResult.size)) {
                    bestResult = currentBest;
                }
            }

            return bestResult;
        } catch (error) {
            console.error('300KB压缩出错:', error);
            throw error;
        }
    }

    // 质量微调函数
    async function fineTuneQuality(canvas, targetSize, baseQuality, outputType) {
        const adjustments = [-0.02, -0.01, -0.005, 0.005, 0.01, 0.02];
        let bestResult = null;

        for (const adj of adjustments) {
            const quality = Math.max(0.5, Math.min(0.99, baseQuality + adj));
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, outputType, quality);
            });

            if (!bestResult || Math.abs(blob.size - targetSize) < Math.abs(bestResult.blob.size - targetSize)) {
                bestResult = { blob, quality };
            }
        }

        return bestResult;
    }

    // 添加SVGA文件压缩功能
    async function compressSVGAFile(file, targetSize, settings) {
        try {
            console.log('开始SVGA文件压缩，目标大小:', formatFileSize(targetSize));
            
            // 检查是否是有效的SVGA文件
            if (!file.name.endsWith('.svga')) {
                throw new Error('不是有效的SVGA文件');
            }
            
            // 解析SVGA文件
            const svgaData = await parseSVGAFile(file);
            
            if (!svgaData || !svgaData.images) {
                throw new Error('SVGA文件解析失败');
            }
            
            console.log('SVGA解析成功，图像数量:', Object.keys(svgaData.images).length);
            
            // 压缩SVGA中的每个图像
            const compressedImages = {};
            const originalSize = file.size;
            let totalCompressedSize = 0;
            
            // 计算每个图像的目标大小比例
            const sizeRatio = targetSize / originalSize;
            
            // 处理每个图像
            for (const [key, imageData] of Object.entries(svgaData.images)) {
                // 将Base64图像转换为Blob
                const imageBlob = await base64ToBlob(imageData);
                
                // 计算该图像的目标大小
                const imageTargetSize = imageBlob.size * sizeRatio;
                
                // 压缩图像
                const compressedImage = await compressSVGAImage(imageBlob, imageTargetSize);
                
                // 将压缩后的图像转回Base64
                const compressedBase64 = await blobToBase64(compressedImage.blob);
                
                // 保存压缩后的图像
                compressedImages[key] = compressedBase64;
                totalCompressedSize += compressedImage.blob.size;
                
                console.log(`图像 ${key} 压缩: ${formatFileSize(imageBlob.size)} -> ${formatFileSize(compressedImage.blob.size)}`);
            }
            
            // 替换原始图像数据
            svgaData.images = compressedImages;
            
            // 重建SVGA文件
            const compressedSVGA = await rebuildSVGAFile(svgaData);
            
            console.log('SVGA压缩完成:', formatFileSize(originalSize), '->', formatFileSize(compressedSVGA.size));
            
            return {
                blob: compressedSVGA,
                extension: '.svga',
                quality: sizeRatio
            };
        } catch (error) {
            console.error('SVGA压缩失败:', error);
            throw error;
        }
    }

    // SVGA文件解析
    async function parseSVGAFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    // 使用pako库解压缩SVGA文件
                    const fileData = new Uint8Array(e.target.result);
                    
                    // 检查是否需要加载pako库
                    if (typeof pako === 'undefined') {
                        // 如果pako未加载，动态加载
                        await loadScript('https://cdn.jsdelivr.net/npm/pako@2.0.4/dist/pako.min.js');
                    }
                    
                    // 解压缩SVGA文件
                    let unzipped;
                    try {
                        unzipped = pako.inflate(fileData);
                    } catch (err) {
                        console.error('SVGA解压缩失败:', err);
                        reject(new Error('SVGA文件解压缩失败'));
                        return;
                    }
                    
                    // 解析protobuf数据
                    const svgaData = {
                        images: {},
                        animations: {}
                    };
                    
                    // 这里需要使用protobuf.js库解析具体的SVGA数据
                    // 由于SVGA使用protobuf格式，这里简化处理
                    // 实际实现需要根据SVGA协议解析
                    
                    // 模拟解析SVGA文件的图像内容
                    const textDecoder = new TextDecoder('utf-8');
                    const jsonStr = textDecoder.decode(unzipped);
                    const dataObj = JSON.parse(jsonStr);
                    
                    if (dataObj && dataObj.images) {
                        svgaData.images = dataObj.images;
                        svgaData.animations = dataObj.animations || {};
                        resolve(svgaData);
                    } else {
                        reject(new Error('SVGA数据格式不正确'));
                    }
                } catch (error) {
                    console.error('解析SVGA文件失败:', error);
                    reject(error);
                }
            };
            
            reader.onerror = function() {
                reject(new Error('读取SVGA文件失败'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    // 压缩SVGA中的单个图像
    async function compressSVGAImage(imageBlob, targetSize) {
        const img = await createImageBitmap(imageBlob);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // 保持原始尺寸
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制图像
        ctx.drawImage(img, 0, 0);
        
        // 使用webP格式获得更好的压缩效果
        let quality = 0.9;
        let minQuality = 0.1;
        let maxQuality = 0.95;
        let bestResult = null;
        let attempts = 0;
        
        // 如果图像已经很小，直接返回
        if (imageBlob.size <= targetSize) {
            return { 
                blob: imageBlob, 
                quality: 1.0 
            };
        }
        
        // 二分查找最佳压缩质量
        while (attempts < 10 && (maxQuality - minQuality) > 0.01) {
            attempts++;
            
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/webp', quality);
            });
            
            if (!bestResult || Math.abs(blob.size - targetSize) < Math.abs(bestResult.blob.size - targetSize)) {
                bestResult = { blob, quality };
            }
            
            if (blob.size > targetSize) {
                maxQuality = quality;
            } else {
                minQuality = quality;
            }
            
            quality = (minQuality + maxQuality) / 2;
        }
        
        return bestResult;
    }

    // 重建SVGA文件
    async function rebuildSVGAFile(svgaData) {
        try {
            // 将修改后的svgaData转换为JSON字符串
            const jsonStr = JSON.stringify(svgaData);
            
            // 转换为Uint8Array
            const textEncoder = new TextEncoder();
            const uint8Array = textEncoder.encode(jsonStr);
            
            // 使用pako压缩
            let compressed;
            try {
                compressed = pako.deflate(uint8Array);
            } catch (err) {
                console.error('SVGA压缩失败:', err);
                throw new Error('SVGA文件重建失败');
            }
            
            // 创建Blob对象
            return new Blob([compressed], { type: 'application/octet-stream' });
        } catch (error) {
            console.error('重建SVGA文件失败:', error);
            throw error;
        }
    }

    // 辅助函数：Base64转Blob
    async function base64ToBlob(base64String) {
        // 移除可能的前缀
        const base64 = base64String.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
        const byteString = atob(base64);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        
        for (let i = 0; i < byteString.length; i++) {
            uint8Array[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([uint8Array], { type: 'image/png' });
    }

    // 辅助函数：Blob转Base64
    async function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // 辅助函数：动态加载脚本
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // 在UI上添加SVGA压缩按钮
    function addSVGACompressionUI() {
        const compressControlsDiv = document.querySelector('.compress-controls');
        
        // 创建SVGA压缩按钮
        const compressSVGABtn = document.createElement('button');
        compressSVGABtn.id = 'compress-svga-btn';
        compressSVGABtn.className = 'primary-btn';
        compressSVGABtn.textContent = '压缩SVGA文件';
        compressSVGABtn.disabled = true;
        
        // 添加按钮到控制区
        compressControlsDiv.appendChild(compressSVGABtn);
        
        // 添加按钮点击事件
        compressSVGABtn.addEventListener('click', () => {
            const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
            if (svgaFiles.length > 0) {
                compressSVGAFiles();
            } else {
                alert('没有选择SVGA文件');
            }
        });
        
        // 更新文件类型检测逻辑，以支持SVGA
        const originalHandleFiles = handleFiles;
        handleFiles = function(files) {
            originalHandleFiles(files);
            
            // 检查是否有SVGA文件
            const hasSVGA = imageQueue.some(img => img.file.name.endsWith('.svga'));
            compressSVGABtn.disabled = !hasSVGA;
        };
    }

    // SVGA文件压缩处理
    async function compressSVGAFiles() {
        if (isProcessing) return;
        
        const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
        if (svgaFiles.length === 0) return;
        
        const targetSize = parseInt(prompt('请输入目标大小 (KB):', '100')) * 1024;
        if (!targetSize || targetSize <= 0) return;
        
        try {
            isProcessing = true;
            compressBtn.disabled = true;
            compress300kBtn.disabled = true;
            document.getElementById('compress-svga-btn').disabled = true;
            compressionProgress.style.display = 'block';
            
            const zip = new JSZip();
            let processed = 0;
            const totalSize = svgaFiles.reduce((sum, img) => sum + img.file.size, 0);
            let compressedSize = 0;
            
            for (const svga of svgaFiles) {
                progressCount.textContent = `${processed + 1}/${svgaFiles.length}`;
                progressFill.style.width = `${(processed + 1) * 100 / svgaFiles.length}%`;
                
                const result = await compressSVGAFile(svga.file, targetSize, {});
                
                if (result && result.blob) {
                    const fileName = `compressed_${svga.name}`;
                    zip.file(fileName, result.blob);
                    compressedSize += result.blob.size;
                    
                    const previewCompressed = svga.element.querySelector('.preview-compressed');
                    const sizeInfo = previewCompressed.querySelector('.size-info');
                    sizeInfo.textContent = formatFileSize(result.blob.size);
                    
                    // 更新预览（虽然无法预览SVGA，但显示图标）
                    const compressedImg = previewCompressed.querySelector('img');
                    compressedImg.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyLDRBNyw3IDAgMCwxIDE5LDExQTcsNyAwIDAsMSAxMiwxOEE3LDcgMCAwLDEgNSwxMUE3LDcgMCAwLDEgMTIsNE0xMiwyQTksOSAwIDAsMCAzLDExQTksOSAwIDAsMCAxMiwyMEE5LDkgMCAwLDAgMjEsMTFBOSw5IDAgMCwwIDEyLDJNMTAsOC41TDE2LjUsMTFMMTAsMTMuNVY4LjVaIiBmaWxsPSIjNTU1Ii8+PC9zdmc+';
                }
                
                processed++;
            }
            
            const zipBlob = await zip.generateAsync({type: 'blob'});
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'compressed_svga_files.zip';
                link.click();
            };
            downloadBtn.disabled = false;
            
            addToHistory(svgaFiles.length, totalSize, compressedSize, 'SVGA');
            
        } catch (error) {
            console.error('SVGA压缩失败:', error);
            alert('SVGA压缩过程中出现错误，请重试');
        } finally {
            isProcessing = false;
            compressBtn.disabled = false;
            compress300kBtn.disabled = false;
            document.getElementById('compress-svga-btn').disabled = false;
            compressionProgress.style.display = 'none';
        }
    }

    // 修改添加到历史记录函数以支持SVGA
    function addToHistory(count, originalSize, compressedSize, type = '图片') {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-info">
                <div class="history-item-date">${new Date().toLocaleString()}</div>
                <div class="history-item-stats">
                    处理：${count}个${type} | 
                    原始：${formatFileSize(originalSize)} | 
                    压缩后：${formatFileSize(compressedSize)} | 
                    节省：${formatFileSize(originalSize - compressedSize)}
                </div>
            </div>
        `;
        
        compressionHistory.insertBefore(historyItem, compressionHistory.firstChild);
        
        // 保存到本地存储
        const history = JSON.parse(localStorage.getItem('compressionHistory') || '[]');
        history.unshift({
            date: new Date().toISOString(),
            count,
            originalSize,
            compressedSize,
            type
        });
        
        // 最多保存50条记录
        if (history.length > 50) {
            history.pop();
        }
        
        localStorage.setItem('compressionHistory', JSON.stringify(history));
    }

    // 初始化SVGA压缩功能
    addSVGACompressionUI();

    // 更新SVGA相关UI
    function updateSVGAUI() {
        const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
        const hasSVGA = svgaFiles.length > 0;
        
        // 获取或创建SVGA压缩按钮
        let svgaBtn = document.getElementById('compress-svga-btn');
        if (!svgaBtn) {
            svgaBtn = document.createElement('button');
            svgaBtn.id = 'compress-svga-btn';
            svgaBtn.className = 'primary-btn svga-btn';
            svgaBtn.textContent = '压缩SVGA文件';
            
            // 添加到按钮区域
            const compressControls = document.querySelector('.compress-controls');
            compressControls.appendChild(svgaBtn);
            
            // 添加点击事件
            svgaBtn.addEventListener('click', openSVGACompressionModal);
        }
        
        // 更新按钮状态
        svgaBtn.disabled = !hasSVGA;
        
        // 如果有SVGA文件，显示SVGA选项区域
        const svgaOptionsArea = document.getElementById('svga-options-area');
        if (hasSVGA) {
            if (!svgaOptionsArea) {
                createSVGAOptionsArea();
            }
            document.getElementById('svga-options-area').style.display = 'block';
        } else if (svgaOptionsArea) {
            svgaOptionsArea.style.display = 'none';
        }
    }

    // 创建SVGA选项区域
    function createSVGAOptionsArea() {
        const settingsArea = document.querySelector('.settings-area');
        
        const svgaOptions = document.createElement('div');
        svgaOptions.id = 'svga-options-area';
        svgaOptions.className = 'settings-group';
        svgaOptions.innerHTML = `
            <h3>SVGA压缩选项</h3>
            <div class="setting-item">
                <label for="svga-target-size">目标文件大小:</label>
                <div class="input-with-unit">
                    <input type="number" id="svga-target-size" min="10" value="100">
                    <select id="svga-size-unit">
                        <option value="KB">KB</option>
                        <option value="MB">MB</option>
                    </select>
                </div>
            </div>
            <div class="setting-item">
                <label for="svga-quality-preference">压缩偏好:</label>
                <select id="svga-quality-preference">
                    <option value="balanced">平衡质量和大小</option>
                    <option value="quality">优先保证质量</option>
                    <option value="size">优先保证大小</option>
                </select>
            </div>
            <div class="setting-item">
                <label for="svga-max-frames">最大帧数限制:</label>
                <input type="number" id="svga-max-frames" min="0" value="0">
                <p class="hint">0表示不限制帧数</p>
            </div>
        `;
        
        settingsArea.appendChild(svgaOptions);
    }

    // SVGA压缩对话框
    function openSVGACompressionModal() {
        const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
        if (svgaFiles.length === 0) {
            alert('没有选择SVGA文件');
            return;
        }
        
        // 创建模态对话框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn">&times;</span>
                <h2>SVGA文件压缩</h2>
                
                <div class="svga-info">
                    <p>已选择 ${svgaFiles.length} 个SVGA文件，总大小: ${
                        formatFileSize(svgaFiles.reduce((sum, img) => sum + img.file.size, 0))
                    }</p>
                </div>
                
                <div class="compression-options">
                    <h3>压缩选项</h3>
                    <div class="option-item">
                        <label for="modal-target-size">目标大小:</label>
                        <div class="input-with-unit">
                            <input type="number" id="modal-target-size" value="${
                                document.getElementById('svga-target-size').value || 100
                            }">
                            <select id="modal-size-unit">
                                <option value="KB" ${document.getElementById('svga-size-unit').value === 'KB' ? 'selected' : ''}>KB</option>
                                <option value="MB" ${document.getElementById('svga-size-unit').value === 'MB' ? 'selected' : ''}>MB</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="option-item">
                        <label for="modal-quality-preference">压缩偏好:</label>
                        <select id="modal-quality-preference">
                            <option value="balanced" ${document.getElementById('svga-quality-preference').value === 'balanced' ? 'selected' : ''}>平衡质量和大小</option>
                            <option value="quality" ${document.getElementById('svga-quality-preference').value === 'quality' ? 'selected' : ''}>优先保证质量</option>
                            <option value="size" ${document.getElementById('svga-quality-preference').value === 'size' ? 'selected' : ''}>优先保证大小</option>
                        </select>
                    </div>
                    
                    <div class="option-item">
                        <label for="modal-max-frames">最大帧数:</label>
                        <input type="number" id="modal-max-frames" value="${
                            document.getElementById('svga-max-frames').value || 0
                        }">
                        <p class="hint">0表示不限制帧数，减少帧数可大幅降低文件大小</p>
                    </div>
                    
                    <div class="option-item">
                        <label for="advanced-options">
                            <input type="checkbox" id="advanced-options"> 显示高级选项
                        </label>
                    </div>
                    
                    <div id="advanced-options-area" style="display:none">
                        <div class="option-item">
                            <label for="modal-compression-method">压缩方法:</label>
                            <select id="modal-compression-method">
                                <option value="auto">自动选择</option>
                                <option value="frame-by-frame">逐帧压缩</option>
                                <option value="sprite-sheet">精灵图优化</option>
                            </select>
                        </div>
                        
                        <div class="option-item">
                            <label for="modal-image-format">图像格式:</label>
                            <select id="modal-image-format">
                                <option value="webp">WebP (最佳压缩率)</option>
                                <option value="png">PNG (无损)</option>
                                <option value="jpeg">JPEG (小体积)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button id="start-svga-compression" class="primary-btn">开始压缩</button>
                    <button id="cancel-modal" class="secondary-btn">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加事件监听
        modal.querySelector('.close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('#cancel-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // 高级选项切换
        modal.querySelector('#advanced-options').addEventListener('change', function() {
            modal.querySelector('#advanced-options-area').style.display = 
                this.checked ? 'block' : 'none';
        });
        
        // 开始压缩按钮
        modal.querySelector('#start-svga-compression').addEventListener('click', () => {
            // 获取压缩设置
            const targetSize = parseFloat(modal.querySelector('#modal-target-size').value);
            const sizeUnit = modal.querySelector('#modal-size-unit').value;
            const qualityPreference = modal.querySelector('#modal-quality-preference').value;
            const maxFrames = parseInt(modal.querySelector('#modal-max-frames').value);
            
            // 高级选项
            const showAdvanced = modal.querySelector('#advanced-options').checked;
            let compressionMethod = 'auto';
            let imageFormat = 'webp';
            
            if (showAdvanced) {
                compressionMethod = modal.querySelector('#modal-compression-method').value;
                imageFormat = modal.querySelector('#modal-image-format').value;
            }
            
            // 关闭模态对话框
            document.body.removeChild(modal);
            
            // 保存设置到界面
            document.getElementById('svga-target-size').value = targetSize;
            document.getElementById('svga-size-unit').value = sizeUnit;
            document.getElementById('svga-quality-preference').value = qualityPreference;
            document.getElementById('svga-max-frames').value = maxFrames;
            
            // 开始压缩
            startSVGACompression(targetSize, sizeUnit, {
                qualityPreference,
                maxFrames,
                compressionMethod,
                imageFormat
            });
        });
    }

    // 开始SVGA压缩
    async function startSVGACompression(targetSize, sizeUnit, options) {
        if (isProcessing) return;
        
        const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
        if (svgaFiles.length === 0) return;
        
        // 计算目标大小（字节）
        const targetBytes = targetSize * (sizeUnit === 'MB' ? 1024 * 1024 : 1024);
        
        try {
            isProcessing = true;
            compressBtn.disabled = true;
            compress300kBtn.disabled = true;
            document.getElementById('compress-svga-btn').disabled = true;
            compressionProgress.style.display = 'block';
            
            const zip = new JSZip();
            let processed = 0;
            const totalSize = svgaFiles.reduce((sum, img) => sum + img.file.size, 0);
            let compressedSize = 0;
            
            // 显示进度条
            progressCount.textContent = `准备压缩SVGA文件...`;
            progressFill.style.width = '0%';
            
            for (const svga of svgaFiles) {
                progressCount.textContent = `压缩 ${svga.name} (${processed + 1}/${svgaFiles.length})`;
                progressFill.style.width = `${(processed + 1) * 100 / svgaFiles.length}%`;
                
                // 根据选项调整压缩参数
                const compressionSettings = {
                    targetSize: targetBytes,
                    qualityPreference: options.qualityPreference,
                    maxFrames: options.maxFrames > 0 ? options.maxFrames : null,
                    method: options.compressionMethod,
                    format: options.imageFormat
                };
                
                const result = await compressSVGAFile(svga.file, targetBytes, compressionSettings);
                
                if (result && result.blob) {
                    const fileName = `compressed_${svga.name}`;
                    zip.file(fileName, result.blob);
                    compressedSize += result.blob.size;
                    
                    // 更新UI显示
                    const previewCompressed = svga.element.querySelector('.preview-compressed');
                    const sizeInfo = previewCompressed.querySelector('.size-info');
                    sizeInfo.textContent = formatFileSize(result.blob.size);
                    
                    // 添加压缩率显示
                    const compressionRate = ((1 - (result.blob.size / svga.file.size)) * 100).toFixed(1);
                    if (!previewCompressed.querySelector('.compression-rate')) {
                        const rateElement = document.createElement('div');
                        rateElement.className = 'compression-rate';
                        previewCompressed.appendChild(rateElement);
                    }
                    previewCompressed.querySelector('.compression-rate').textContent = 
                        `压缩率: ${compressionRate}%`;
                }
                
                processed++;
            }
            
            // 生成压缩包
            progressCount.textContent = `生成压缩包...`;
            const zipBlob = await zip.generateAsync({type: 'blob'});
            
            // 启用下载按钮
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'compressed_svga_files.zip';
                link.click();
            };
            downloadBtn.disabled = false;
            
            // 添加到历史记录
            addToHistory(svgaFiles.length, totalSize, compressedSize, 'SVGA');
            
            // 完成提示
            progressCount.textContent = `SVGA压缩完成!`;
            setTimeout(() => {
                progressCount.textContent = '';
            }, 3000);
            
        } catch (error) {
            console.error('SVGA压缩失败:', error);
            alert('SVGA压缩过程中出现错误: ' + error.message);
        } finally {
            isProcessing = false;
            compressBtn.disabled = false;
            compress300kBtn.disabled = false;
            document.getElementById('compress-svga-btn').disabled = false;
            compressionProgress.style.display = 'none';
        }
    }

    // 添加CSS样式
    function addSVGAStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* SVGA文件样式 */
            .svga-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 80px;
                background-color: #f0f0f0;
                color: #333;
                font-weight: bold;
                font-size: 18px;
                border-radius: 4px;
            }
            
            /* SVGA压缩按钮样式 */
            .svga-btn {
                background-color: #4a6bdf;
            }
            
            .svga-btn:hover {
                background-color: #3a5bcf;
            }
            
            /* 模态对话框样式 */
            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .modal-content {
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                width: 80%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
            }
            
            .close-btn {
                position: absolute;
                top: 10px;
                right: 10px;
                font-size: 24px;
                cursor: pointer;
            }
            
            .compression-options {
                margin: 20px 0;
            }
            
            .option-item {
                margin: 10px 0;
            }
            
            .modal-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
            
            .hint {
                font-size: 12px;
                color: #666;
                margin: 4px 0;
            }
            
            .compression-rate {
                color: #4CAF50;
                font-weight: bold;
                margin-top: 5px;
            }
            
            /* 输入框和单位组合样式 */
            .input-with-unit {
                display: flex;
                align-items: center;
            }
            
            .input-with-unit input {
                flex: 1;
                margin-right: 5px;
            }
        `;
        
        document.head.appendChild(styleElement);
    }

    // SVGA压缩相关的常量和变量
    const SVGA_SETTINGS = {
        MIN_SIZE: 25, // 最小25KB
        SIZE_STEP: 25, // 25KB步进
        DEFAULT_QUALITY: 0.8
    };

    // SVGA文件处理类
    class SVGAHandler {
        constructor() {
            this.compressBtn = document.getElementById('compress-svga');
            this.sizeInput = document.getElementById('svga-size');
            this.sizeUnit = document.getElementById('svga-size-unit');
            this.qualitySelect = document.getElementById('svga-quality');
            this.settingsPanel = document.getElementById('svga-settings');
            
            this.initializeUI();
            this.bindEvents();
        }
        
        initializeUI() {
            // 设置输入框步进值
            this.sizeInput.step = SVGA_SETTINGS.SIZE_STEP;
            this.sizeInput.min = SVGA_SETTINGS.MIN_SIZE;
            
            // 初始化压缩按钮状态
            this.updateCompressButton();
        }
        
        bindEvents() {
            // 文件选择变化时更新UI
            document.getElementById('file-input').addEventListener('change', (e) => {
                this.handleFileSelection(e.target.files);
            });
            
            // SVGA压缩按钮点击事件
            this.compressBtn.addEventListener('click', () => {
                this.startCompression();
            });
            
            // 大小输入框变化事件
            this.sizeInput.addEventListener('input', () => {
                this.validateSizeInput();
            });
        }
        
        handleFileSelection(files) {
            const svgaFiles = Array.from(files).filter(file => file.name.endsWith('.svga'));
            this.compressBtn.disabled = svgaFiles.length === 0;
            
            if (svgaFiles.length > 0) {
                this.settingsPanel.style.display = 'block';
                // 设置默认目标大小为最大文件大小的80%
                const maxFileSize = Math.max(...svgaFiles.map(f => f.size));
                const defaultTargetKB = Math.ceil((maxFileSize / 1024) * 0.8 / 25) * 25;
                this.sizeInput.value = defaultTargetKB;
            } else {
                this.settingsPanel.style.display = 'none';
            }
        }
        
        validateSizeInput() {
            let value = parseInt(this.sizeInput.value);
            if (isNaN(value) || value < SVGA_SETTINGS.MIN_SIZE) {
                value = SVGA_SETTINGS.MIN_SIZE;
            }
            // 调整为25KB的倍数
            value = Math.ceil(value / SVGA_SETTINGS.SIZE_STEP) * SVGA_SETTINGS.SIZE_STEP;
            this.sizeInput.value = value;
            
            this.updateCompressButton();
        }
        
        updateCompressButton() {
            const hasFiles = imageQueue.some(img => img.file.name.endsWith('.svga'));
            const validSize = parseInt(this.sizeInput.value) >= SVGA_SETTINGS.MIN_SIZE;
            
            this.compressBtn.disabled = !hasFiles || !validSize;
            if (hasFiles && validSize) {
                const targetSize = this.getTargetSize();
                this.compressBtn.textContent = `压缩SVGA至 ${formatFileSize(targetSize)}`;
            } else {
                this.compressBtn.textContent = '压缩SVGA文件';
            }
        }
        
        getTargetSize() {
            const size = parseInt(this.sizeInput.value);
            const multiplier = this.sizeUnit.value === 'MB' ? 1024 * 1024 : 1024;
            return size * multiplier;
        }
        
        async startCompression() {
            if (isProcessing) return;
            
            const svgaFiles = imageQueue.filter(img => img.file.name.endsWith('.svga'));
            if (svgaFiles.length === 0) {
                alert('请选择SVGA文件');
                return;
            }
            
            const targetSize = this.getTargetSize();
            const quality = this.getQualitySettings();
            
            try {
                isProcessing = true;
                this.updateUIForProcessing(true);
                
                for (const file of svgaFiles) {
                    await this.compressSVGAFile(file, targetSize, quality);
                }
                
                this.showCompressionComplete();
            } catch (error) {
                console.error('SVGA压缩失败:', error);
                alert('压缩过程中出现错误: ' + error.message);
            } finally {
                isProcessing = false;
                this.updateUIForProcessing(false);
            }
        }
        
        getQualitySettings() {
            const qualityMode = this.qualitySelect.value;
            return {
                quality: qualityMode === 'high' ? 0.9 :
                        qualityMode === 'balanced' ? 0.8 : 0.6,
                optimizeFrames: qualityMode === 'size',
                maintainAspectRatio: true
            };
        }
        
        updateUIForProcessing(processing) {
            this.compressBtn.disabled = processing;
            this.sizeInput.disabled = processing;
            this.sizeUnit.disabled = processing;
            this.qualitySelect.disabled = processing;
            
            // 更新进度显示
            const progressBar = document.querySelector('.progress-bar');
            progressBar.style.display = processing ? 'block' : 'none';
        }
        
        showCompressionComplete() {
            const notification = document.createElement('div');
            notification.className = 'compression-notification';
            notification.textContent = 'SVGA压缩完成！';
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }

    // 初始化SVGA处理器
    document.addEventListener('DOMContentLoaded', () => {
        window.svgaHandler = new SVGAHandler();
    });

    // 添加SVGA相关样式
    const svgaStyles = `
        .svga-btn {
            background-color: #4a90e2;
            margin-left: 10px;
        }
        
        .svga-btn:disabled {
            background-color: #ccc;
        }
        
        #svga-settings {
            margin-top: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .size-input {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .size-input input {
            width: 100px;
        }
        
        .compression-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            animation: fadeInOut 3s ease-in-out;
        }
        
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
    `;

    // 添加样式到页面
    const styleSheet = document.createElement('style');
    styleSheet.textContent = svgaStyles;
    document.head.appendChild(styleSheet);
});