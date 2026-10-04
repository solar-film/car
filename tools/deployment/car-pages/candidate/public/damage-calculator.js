const DamageCalculator = (function() {
        let reasonMap = {};
        
        function normalizeFieldName(name) {
            return textValue(name).replace(/[\s._\-–—/\\]+/g, '').toLowerCase();
        }

        const INSTALLER_ASSIGNMENT_COLUMNS = [
            'บานหน้า', 'บานหลัง', 'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
            'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา', 'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
            'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2', 'ซันรูฟ-ช่อง3'
        ].map(normalizeFieldName);

        const GLASS_KEY_COLUMN = 'ประเภทรถยนต์';
        const GLASS_POSITION_COLUMN = 'ตำแหน่งติดตั้ง';
        const GLASS_POSITION_COLUMNS = [GLASS_POSITION_COLUMN, 'ตำแหน่งติดตั้ง ใหม่', 'ตำแหน่งติดตั้งใหม่', 'ตำแหน่ง', 'รายการ', 'ชิ้นงาน'];
        const DAMAGE_POSITION_NAMES = [
            'บานหน้า', 'บานหลัง', 'ประตู-หน้าซ้าย', 'ประตู-หน้าขวา',
            'ประตู-หลังซ้าย', 'ประตู-หลังขวา', 'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
            'บานฟิก-ซ้าย(1)', 'บานฟิก-ขวา(1)', 'บานฟิก', 'ซันรูฟ'
        ];

        function textValue(value, fallback = '') {
            if (value === null || value === undefined) return fallback;
            const text = String(value).trim();
            return text === '' ? fallback : text;
        }

        function escapeHtml(value) {
            return textValue(value).replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));
        }

        function parseCsv(csvText) {
            return new Promise(resolve => {
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: header => header.trim(),
                    complete: results => resolve(results.data)
                });
            });
        }

        function isHtmlResponseText(text) {
            const trimmedText = text.trim().toLowerCase();
            return trimmedText.startsWith('<!doctype html>') ||
                trimmedText.startsWith('<html') ||
                trimmedText.includes('google.visualization.query.setresponse') ||
                trimmedText.includes('invalid query');
        }

        async function fetchCsvText(urls) {
            const urlList = Array.isArray(urls) ? urls : [urls];
            let lastError = null;
            for (const url of urlList) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const text = await response.text();
                    if (isHtmlResponseText(text)) throw new Error('Permission denied');
                    return text;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error('Unable to fetch CSV.');
        }

        async function fetchCsvTexts(urls) {
            const texts = [];
            await Promise.all(urls.map(async url => {
                try {
                    texts.push(await fetchCsvText(url));
                } catch (error) {
                    console.warn('CSV source skipped', error);
                }
            }));
            return texts;
        }

        async function parseCsvTexts(csvTexts) {
            const groups = await Promise.all(csvTexts.map(parseCsv));
            return groups.flat();
        }

        function normalizeFieldName(value) {
            return textValue(value).replace(/[\s._\-()（）/]+/g, '').toLowerCase();
        }

        function findField(row, candidates) {
            if (!row) return '';
            const keys = Object.keys(row).filter(key => normalizeFieldName(key));
            const normalizedCandidates = candidates.map(normalizeFieldName).filter(Boolean);
            const key = keys.find(item => normalizedCandidates.includes(normalizeFieldName(item))) ||
                keys.find(item => normalizedCandidates.some(candidate => {
                    const normalizedItem = normalizeFieldName(item);
                    if (!normalizedItem || candidate.length < 3 || normalizedItem.length < 3) return false;
                    return normalizedItem.includes(candidate) || candidate.includes(normalizedItem);
                }));
            return key ? textValue(row[key]) : '';
        }

        function findKey(row, candidates) {
            if (!row) return '';
            const keys = Object.keys(row).filter(key => normalizeFieldName(key));
            const normalizedCandidates = candidates.map(normalizeFieldName).filter(Boolean);
            return keys.find(item => normalizedCandidates.includes(normalizeFieldName(item))) ||
                keys.find(item => normalizedCandidates.some(candidate => {
                    const normalizedItem = normalizeFieldName(item);
                    if (!normalizedItem || candidate.length < 3 || normalizedItem.length < 3) return false;
                    return normalizedItem.includes(candidate) || candidate.includes(normalizedItem);
                }));
        }

        function normalizeLookupId(value) {
            return textValue(value).replace(/[\s._\-–—/\\]+/g, '').toLowerCase();
        }

        function cleanLookup(value) {
            return textValue(value).replace(/\s+/g, ' ').trim().toLowerCase();
        }

        function findRecordId(row, keyCandidates) {
            const key = findKey(row, keyCandidates);
            const explicitId = key ? textValue(row[key]) : '';
            if (explicitId) return explicitId;

            return Object.values(row).map(textValue).find(value => /^job[\s._\-–—/\\]*\w+/i.test(value)) || '';
        }

        function makeLookupMap(rows, keyCandidates) {
            const map = {};
            rows.forEach(row => {
                const key = findKey(row, keyCandidates);
                const id = key ? textValue(row[key]) : '';
                if (!id) return;
                map[id] = row;
                map[normalizeLookupId(id)] = row;
            });
            return map;
        }

        function makeDetailGroups(rows) {
            const groups = {};
            rows.forEach(row => {
                const id = findRecordId(row, ['JobID', 'Job ID', 'งาน', 'รหัสงาน', 'เลขงาน', 'BookingID', 'Booking ID']);
                if (!id) return;
                const normalized = normalizeLookupId(id);
                if (!groups[normalized]) groups[normalized] = [];
                groups[normalized].push(row);
            });
            return groups;
        }

        function makeInstallerGroups(rows) {
            const groups = {};
            rows.forEach(row => {
                const id = findRecordId(row, ['JobID', 'Job ID', 'งาน', 'รหัสงาน', 'เลขงาน', 'BookingID', 'Booking ID']);
                if (!id) return;
                const normalized = normalizeLookupId(id);
                if (!groups[normalized]) groups[normalized] = [];
                groups[normalized].push(row);
            });
            return groups;
        }

        function findRowsByRecordId(rows, recordId) {
            const target = normalizeLookupId(recordId);
            if (!target) return [];
            return rows.filter(row => Object.values(row).some(value => {
                const candidate = normalizeLookupId(value);
                return candidate && (
                    candidate === target ||
                    candidate.includes(target) ||
                    target.includes(candidate)
                );
            }));
        }

        function buildInstallerNameMap(rows) {
            return rows.reduce((map, row) => {
                const installerId = findField(row, [
                    'Ins_ID', 'InsID', 'InstallerID', 'Installer ID', 'รหัสช่าง', 'ID'
                ]);
                const installerName = getInstallerDisplayName(row, true);
                if (!installerId || !installerName) return map;

                splitReferenceValues(installerId).forEach(id => {
                    map[normalizeLookupId(id)] = installerName;
                });
                return map;
            }, {});
        }

        function getInstallerDisplayName(row, allowGenericName = false) {
            const nameCandidates = [
                'ช่างติดตั้ง', 'ชื่อช่าง', 'ชื่อช่างติดตั้ง', 'พนักงานติดตั้ง',
                'InstallerName', 'Installer Name', 'TechnicianName', 'Technician Name',
                'ผู้ติดตั้ง', 'ทีมติดตั้ง', 'รายชื่อช่าง', 'ชื่อผู้ติดตั้ง'
            ];
            if (allowGenericName) nameCandidates.push('ชื่อ', 'Name');

            const explicitValue = findField(row, nameCandidates);
            const names = splitInstallerNames(explicitValue);
            return names.join(', ');
        }

        function splitReferenceValues(value) {
            return textValue(value)
                .split(/[\n,\/|、，]+/)
                .map(item => item.trim())
                .filter(Boolean);
        }

        function resolveInstallerIds(row, installerNameMap) {
            const idKey = findKey(row, [
                'Ins_ID', 'InsID', 'InstallerID', 'Installer ID', 'รหัสช่าง'
            ]);
            if (!idKey) return [];

            return splitReferenceValues(row[idKey])
                .map(id => installerNameMap[normalizeLookupId(id)] || '')
                .filter(Boolean);
        }

        function getInstallerNames(rows, installerNameMap = {}) {
            const names = rows.flatMap(row => {
                const directNames = splitInstallerNames(getInstallerDisplayName(row));
                if (directNames.length) return directNames;

                const assignmentNames = Object.entries(row).flatMap(([key, value]) => {
                    if (!isInstallerAssignmentColumn(key)) return [];
                    return splitInstallerNames(value);
                });
                if (assignmentNames.length) return assignmentNames;

                const namesFromIds = resolveInstallerIds(row, installerNameMap);
                if (namesFromIds.length) return namesFromIds;

                return Object.entries(row).flatMap(([key, value]) => {
                    const normalizedKey = normalizeFieldName(key);
                    const text = textValue(value);
                    if (!text || text === '-') return [];
                    if (isInstallerMetaField(normalizedKey, text)) return [];
                    if (isInstallerFieldName(normalizedKey)) {
                        return splitInstallerNames(text);
                    }
                    if (isCheckedInstallerColumn(text) && looksLikeInstallerColumnName(key)) {
                        return splitInstallerNames(key);
                    }
                    return [];
                });
            });
            return [...new Set(names.filter(name => !isDamagePositionText(name)))];
        }

        function isInstallerAssignmentColumn(key) {
            const normalizedKey = normalizeFieldName(key);
            return INSTALLER_ASSIGNMENT_COLUMNS.includes(normalizedKey) ||
                normalizedKey.startsWith(normalizeFieldName('ซันรูฟช่อง'));
        }

        function isInstallerFieldName(normalizedKey) {
            return [
                'ช่างติดตั้ง', 'ชื่อช่าง', 'ช่าง', 'installer', 'installername',
                'technician', 'staff', 'ผู้ติดตั้ง', 'ทีมติดตั้ง', 'รายชื่อช่าง'
            ].some(candidate => normalizedKey.includes(normalizeFieldName(candidate)));
        }

        function isCheckedInstallerColumn(value) {
            return ['true', 'yes', 'y', '1', '✓', '✔', 'x'].includes(textValue(value).toLowerCase());
        }

        function looksLikeInstallerColumnName(value) {
            const text = textValue(value);
            const normalized = normalizeFieldName(text);
            if (!text || isDamagePositionText(text)) return false;
            if (isInstallerMetaField(normalized, text)) return false;
            if ([
                'cust', 'ลูกค้า', 'ประเภท', 'รุ่นรถ', 'ทะเบียน', 'ป้าย', 'ฟิล์ม',
                'โปรโมชั่น', 'warranty', 'ยอดขาย', 'สถานะ', 'สี', 'วันที่', 'เวลา'
            ].some(excluded => normalized.includes(normalizeFieldName(excluded)))) return false;
            return looksLikeInstallerName(text);
        }

        function splitInstallerNames(value) {
            return textValue(value)
                .split(/[\n,\/|、，]+/)
                .map(name => name.trim())
                .filter(name => name && !isDamagePositionText(name) && looksLikeInstallerName(name));
        }

        function isDamagePositionText(value) {
            const normalized = normalizePositionName(value);
            if (!normalized) return false;
            return DAMAGE_POSITION_NAMES.some(position => {
                const positionKey = normalizePositionName(position);
                return normalized === positionKey ||
                    normalized.includes(positionKey) ||
                    positionKey.includes(normalized);
            });
        }

        function isInstallerMetaField(normalizedKey, text) {
            if ([
                'jobid', 'bookingid', 'detailinstallerid', 'detailid', 'installerid',
                'insid', 'รหัส', 'code', 'วันที่', 'เวลา', 'หมายเหตุ', 'ลำดับ',
                'status', 'สถานะ'
            ].some(excluded => normalizedKey.includes(normalizeFieldName(excluded)))) return true;
            if (/^job[\s._\-–—/\\]*\w+/i.test(text)) return true;
            if (/^(ins|installer)[\s._\-–—/\\]*id/i.test(text)) return true;
            if (isDateTimeLike(text)) return true;
            return false;
        }

        function looksLikeInstallerName(value) {
            const text = textValue(value);
            if (!text || text.length < 2) return false;
            if (/^\d+(\.\d+)?$/.test(text)) return false;
            if (/^(true|false|yes|no|y|n|x)$/i.test(text)) return false;
            if (/^[-–—]+$/.test(text)) return false;
            return /[ก-๙a-z]/i.test(text);
        }

        function getDamagePosition(detail) {
            if (!detail) return '';
            const explicitPosition = findField(detail, [
                'ตำแหน่ง', 'ตำแหน่งเสียหาย', 'ตำแหน่งที่เสียหาย', 'จุดเสียหาย',
                'ส่วนที่เสียหาย', 'ตำแหน่งติดตั้ง', 'ตำแหน่งติดตั้ง ใหม่', 'ตำแหน่งติดตั้งใหม่', 'ตำแหน่งงาน', 'ชิ้นงาน'
            ]);
            if (isValidPositionValue(explicitPosition)) return explicitPosition;

            const positions = DAMAGE_POSITION_NAMES.filter(position => {
                const key = findKey(detail, [position]);
                if (!key) return false;
                const value = textValue(detail[key]);
                return value && value !== '-' && !isDateTimeLike(value);
            });

            return [...new Set(positions)].join(', ');
        }

        function isDateTimeLike(value) {
            const text = textValue(value);
            return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text) || /\d{1,2}:\d{2}/.test(text);
        }

        function isValidPositionValue(value) {
            const text = textValue(value);
            if (!text || text === '-' || isDateTimeLike(text)) return false;
            if (/^job[-\s]?\w+/i.test(text)) return false;
            return true;
        }

        function normalizePositionName(value) {
            return normalizeFieldName(value)
                .replace(/ซ้าย/g, 'ซ')
                .replace(/ขวา/g, 'ข')
                .replace(/หน้า/g, 'น')
                .replace(/หลัง/g, 'ล');
        }

        function getPositionParts(positionText) {
            return textValue(positionText)
                .split(/[,/|、，]+/)
                .map(position => position.trim())
                .filter(Boolean);
        }

        function normalizeCarModels(rows) {
            return rows.map(row => ({
                brand: findField(row, ['ยี่ห้อรถยนต์', 'ยี่ห้อ']),
                model: findField(row, ['รุ่นรถยนต์', 'รุ่น']),
                priceGroup: findField(row, ['กลุ่มราคา', 'ประเภทรถยนต์'])
            })).filter(car => car.model);
        }

        function findCarModelInfo(carModelText, carModels) {
            const modelLookup = cleanLookup(carModelText);
            if (!modelLookup) return null;

            return carModels.find(car => cleanLookup(car.model) === modelLookup) ||
                carModels.find(car => modelLookup.includes(cleanLookup(car.model)) || cleanLookup(car.model).includes(modelLookup)) ||
                null;
        }

        function getGlassGroupKeys(booking, carModels) {
            const carModel = findField(booking, ['รุ่นรถยนต์', 'รุ่นรถ']);
            const carType = findField(booking, ['ประเภทรถยนต์', 'กลุ่มราคา', 'ประเภทรถ']);
            const carInfo = findCarModelInfo(carModel, carModels);
            return [
                carType,
                carInfo?.priceGroup,
                carInfo?.model,
                carModel
            ].map(cleanLookup).filter(Boolean);
        }

        function rowMatchesGlassGroup(row, groupKeys) {
            if (!groupKeys.length) return false;
            const directValues = [
                findField(row, [GLASS_KEY_COLUMN, 'กลุ่มราคา', 'รุ่นรถยนต์', 'รุ่นรถ', 'ประเภทรถ', 'Model', 'Car'])
            ].map(cleanLookup).filter(Boolean);

            if (directValues.some(value => groupKeys.includes(value))) return true;

            return Object.entries(row).some(([key, value]) => {
                const normalizedKey = normalizeFieldName(key);
                if (['w', 'h', 'พท', 'พื้นที่'].includes(normalizedKey)) return false;
                if (DAMAGE_POSITION_NAMES.some(position => normalizePositionName(key) === normalizePositionName(position))) return false;
                const cell = cleanLookup(value);
                if (!cell || /\d+\s*[x×*]\s*\d+/i.test(cell)) return false;
                return groupKeys.some(group => cell === group || cell.includes(group) || group.includes(cell));
            });
        }

        function rowHasPositionSize(row, positionName) {
            return Boolean(findPositionSizeValue(row, positionName));
        }

        function findGlassSizeRow(glassRows, groupKeys, positionName) {
            if (!glassRows.length || !groupKeys.length) return null;
            const targetPosition = normalizePositionName(positionName);
            const byGroup = glassRows.filter(row => rowMatchesGlassGroup(row, groupKeys));
            if (!byGroup.length) return null;
            const candidates = byGroup;

            return candidates.find(row => rowHasPositionSize(row, positionName)) ||
                candidates.find(row => normalizePositionName(findField(row, GLASS_POSITION_COLUMNS)) === targetPosition) ||
                candidates.find(row => {
                    const rowPosition = normalizePositionName(findField(row, GLASS_POSITION_COLUMNS));
                    return rowPosition && (rowPosition.includes(targetPosition) || targetPosition.includes(rowPosition));
                }) ||
                null;
        }

        function findPositionSizeValue(row, positionName) {
            const target = normalizePositionName(positionName);
            const directKey = Object.keys(row).find(key => {
                const normalizedKey = normalizePositionName(key);
                return normalizedKey === target ||
                    normalizedKey.includes(target) ||
                    target.includes(normalizedKey);
            });
            if (directKey) {
                const value = textValue(row[directKey]);
                if (value && value !== '-') return value;
            }

            return findField(row, [
                `${positionName} ขนาด`, `ขนาด ${positionName}`, `${positionName}(นิ้ว)`,
                `${positionName} นิ้ว`, positionName
            ]);
        }

        function parseDimension(value) {
            const text = textValue(value).replace(/[×*]/g, 'x');
            const match = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
            if (!match) return null;
            const width = parseFloat(match[1]);
            const height = parseFloat(match[2]);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
            return { width, height };
        }

        function formatSizeNumber(value) {
            return value.toLocaleString('th-TH', { maximumFractionDigits: 2 });
        }

        function formatDimension(dimension) {
            return `${formatSizeNumber(dimension.width)} x ${formatSizeNumber(dimension.height)} นิ้ว`;
        }

        function getGlassMeasurement(row, positionName) {
            if (!row) return null;
            const positionSize = parseDimension(findPositionSizeValue(row, positionName));
            if (positionSize) {
                return {
                    sqf: (positionSize.width * positionSize.height) / 144,
                    sizeText: formatDimension(positionSize)
                };
            }

            const dimension = parseDimension(findField(row, ['ขนาดกระจก', 'ขนาด', 'Size', 'GlassSize']));
            if (dimension) {
                return {
                    sqf: (dimension.width * dimension.height) / 144,
                    sizeText: formatDimension(dimension)
                };
            }

            const width = parseNumber(findField(row, ['W', 'กว้าง', 'Width']));
            const height = parseNumber(findField(row, ['H', 'ยาว', 'สูง', 'Height']));
            if (width > 0 && height > 0) {
                return {
                    sqf: (width * height) / 144,
                    sizeText: formatDimension({ width, height })
                };
            }

            const areaValue = findField(row, ['พท.', 'พท', 'พื้นที่', 'Sqf', 'ตารางฟุต']);
            const areaDimension = parseDimension(areaValue);
            if (areaDimension) {
                return {
                    sqf: (areaDimension.width * areaDimension.height) / 144,
                    sizeText: formatDimension(areaDimension)
                };
            }

            const area = parseNumber(areaValue);
            return area > 0 ? {
                sqf: area,
                sizeText: `พื้นที่ ${area.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ตรฟ.`
            } : null;
        }

        function calculateSqfFromGlassRow(row, positionName) {
            return getGlassMeasurement(row, positionName)?.sqf ?? null;
        }

        function getExplicitDamageSqf(detail) {
            if (!detail) return 0;
            return parseNumber(findField(detail, [
                'Sqf.เสียหาย', 'Sqfเสียหาย', 'Sqf เสียหาย', 'SQFเสียหาย',
                'Sq.ft.เสียหาย', 'Sqftเสียหาย', 'ตารางฟุตเสียหาย', 'พื้นที่เสียหาย',
                'Sq.เสียหาย', 'Sq เสียหาย', 'ตร.ฟุตเสียหาย', 'ตรฟุตเสียหาย',
                'ตารางฟุต', 'Sqf'
            ]));
        }

        function getDamageSizeInfo(detail, booking, glassRows, carModels, positionText = getDamagePosition(detail)) {
            const positions = getPositionParts(positionText);
            const groupKeys = getGlassGroupKeys(booking, carModels);
            if (!positions.length || !glassRows.length || !groupKeys.length) {
                return { sqf: null, sizeText: '' };
            }

            let hasMissingSize = false;
            const sizeParts = [];
            const calculatedSqf = positions.reduce((sum, position) => {
                const glassRow = findGlassSizeRow(glassRows, groupKeys, position);
                const measurement = getGlassMeasurement(glassRow, position);
                if (!measurement) {
                    hasMissingSize = true;
                    return sum;
                }

                sizeParts.push(`${position}: ${measurement.sizeText}`);
                return sum + measurement.sqf;
            }, 0);

            if (hasMissingSize || calculatedSqf <= 0) {
                return { sqf: null, sizeText: sizeParts.join('\n') };
            }
            return { sqf: calculatedSqf, sizeText: sizeParts.join('\n') };
        }

        function getDamageSqf(detail, booking, glassRows, carModels) {
            return getDamageSizeInfo(detail, booking, glassRows, carModels).sqf;
        }

        function getDamageSizeInfoFromData(detail, booking) {
            let explicitSqf = 0;
            let explicitSource = '';
            
            if (detail) {
                explicitSqf = getExplicitDamageSqf(detail);
                if (explicitSqf > 0) explicitSource = 'ระบุ Sqf. (Data)';
            }
            if ((!explicitSqf || explicitSqf <= 0) && booking) {
                explicitSqf = getExplicitDamageSqf(booking);
                if (explicitSqf > 0) explicitSource = 'ระบุ Sqf. (Booking)';
            }

            if (!detail) {
                return { sqf: explicitSqf > 0 ? explicitSqf : null, sizeText: explicitSource };
            }

            let width = parseNumber(findField(detail, ['กว้าง', 'W', 'Width']));
            let length = parseNumber(findField(detail, ['ยาว', 'H', 'Length', 'สูง', 'Height']));
            const legacyDimension = parseDimension(findField(detail, ['ขนาด', 'Size']));
            if ((!width || !length) && legacyDimension) {
                width = legacyDimension.width;
                length = legacyDimension.height;
            }
            const quantityText = findField(detail, ['จำนวน', 'Qty', 'Quantity']);
            const quantity = quantityText ? parseNumber(quantityText) : 1;

            if (width <= 0 || length <= 0 || quantity <= 0) {
                return { sqf: explicitSqf > 0 ? explicitSqf : 0, sizeText: explicitSource || '-' };
            }

            return {
                sqf: (width * length * quantity) / 144,
                sizeText: `${formatSizeNumber(width)} x ${formatSizeNumber(length)} x ${formatSizeNumber(quantity)}`
            };
        }

        function getFilmName(detail, booking) {
            return (detail && findField(detail, ['รุ่นฟิล์ม', 'รุ่นฟิล์มที่เลือก', 'ยี่ห้อฟิล์ม', 'แบรนด์ฟิล์ม', 'FilmBrand'])) ||
                findField(booking, ['ยี่ห้อฟิล์ม', 'รุ่นฟิล์มที่เลือก', 'แบรนด์ฟิล์ม']);
        }

        function buildReasonMap(rows) {
            reasonMap = {};
            rows.forEach(row => {
                const idKey = findKey(row, ['ID']);
                const reasonKey = findKey(row, ['เหตุผลขอตัดฟิล์ม', 'เหตุผล']);
                if (!idKey || !reasonKey) return;
                const id = textValue(row[idKey]);
                const reason = textValue(row[reasonKey]);
                if (!id || !reason) return;
                reasonMap[id] = reason;
                reasonMap[normalizeLookupId(id)] = reason;
            });
        }

        function translateReason(value) {
            const id = textValue(value);
            if (!id || id === '-') return '';
            return reasonMap[id] || reasonMap[normalizeLookupId(id)] || id;
        }

        function parseNumber(value) {
            const number = parseFloat(textValue(value, '0').replace(/[^\d.-]/g, ''));
            return Number.isFinite(number) ? number : 0;
        }

        function parseDamageDate(value) {
            const raw = textValue(value);
            const match = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (!match) return null;
            let year = parseInt(match[3], 10);
            if (year < 100) year += 2000;
            if (year > 2400) year -= 543;
            const date = new Date(year, parseInt(match[2], 10) - 1, parseInt(match[1], 10));
            return Number.isNaN(date.getTime()) ? null : date;
        }

        function monthKeyFromDate(date) {
            if (!date) return 'ไม่ระบุเดือน';
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function dateKeyFromDate(date) {
            if (!date) return '';
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }

        function currentMonthKey() {
            return monthKeyFromDate(new Date());
        }

        function monthLabelFromDate(date) {
            if (!date) return 'ไม่ระบุเดือน';
            const month = date.toLocaleDateString('th-TH', { month: 'short' }).replace('.', '');
            return `${month}. ${String(date.getFullYear()).slice(-2)}`;
        }

        function formatMoney(value) {
            return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function renderSizeText(sizeText) {
            return escapeHtml(sizeText).replace(/\n/g, '<br>');
        }

        function renderSqfCell(value, sizeText = '') {
            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
                return `
                    <div class="text-right text-slate-400">
                        <span class="text-sm font-medium">-</span>
                        ${sizeText && sizeText !== '-' ? `<div class="mt-1 text-xs leading-relaxed text-slate-500">${renderSizeText(sizeText)}</div>` : ''}
                    </div>
                `;
            }
            return `
                <div class="text-right">
                    <div>${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>
                    ${sizeText && sizeText !== '-' ? `<div class="mt-1 text-xs leading-relaxed text-slate-500">${renderSizeText(sizeText)}</div>` : ''}
                </div>
            `;
        }

        function renderInstallerCell(value) {
            const installer = textValue(value, '-');
            if (!installer || installer === '-') {
                return '<span class="text-sm font-semibold text-slate-500">-</span>';
            }
            return `
                <span class="inline-flex max-w-[11rem] items-center rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-sm font-medium text-sky-800 shadow-sm">
                    <span class="truncate">${escapeHtml(installer)}</span>
                </span>
            `;
        }

        function hasDisplayText(value) {
            const text = textValue(value);
            return Boolean(text && text !== '-');
        }

        function buildDamageRows(bookingRows, dataRows, installerRows, reasonRows, customerRows) {
            buildReasonMap(reasonRows);
            const dataGroups = makeDetailGroups(dataRows);
            const installerGroups = makeInstallerGroups(installerRows);
            const installerNameMap = buildInstallerNameMap(installerRows);
            const customerMap = makeLookupMap(customerRows, ['CustID', 'CustomerID', 'ลูกค้า']);

            return bookingRows.flatMap(booking => {
                const status = String(findField(booking, ['Status', 'สถานะ'])).replace(/[\s._\-()（）/\\]+/g, '').toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
                if (status === 'ยกเลิก' || status === 'ยกเลิกการติดตั้ง') return [];

                const promotion = findField(booking, ['Pro_ID', 'โปรโมชั่น']);
                const normalizedPromo = normalizeLookupId(promotion);
                const isMistake = normalizedPromo === 'mistake';

                if (!isMistake) return [];

                const jobId = findField(booking, ['JobID', 'Job ID']);
                const custId = findField(booking, ['CustID']);
                const customer = customerMap[custId] || customerMap[normalizeLookupId(custId)] || {};
                const details = dataGroups[normalizeLookupId(jobId)] || [null];
                const installersForJob = installerGroups[normalizeLookupId(jobId)] || findRowsByRecordId(installerRows, jobId);
                const installerNames = getInstallerNames(installersForJob || [], installerNameMap);

                return details.map(detail => {
                    const dateText = findField(booking, ['วันที่ติดตั้ง', 'วันที่']);
                    const date = parseDamageDate(dateText);
                    const reasonId = detail ? findField(detail, ['เหตุผลขอตัดฟิล์ม', 'เหตุผล']) : '';
                    const reasonText = translateReason(reasonId);
                    const position = getDamagePosition(detail);
                    const sizeInfo = getDamageSizeInfoFromData(detail, booking);
                    const damageValue = parseNumber(findField(booking, ['ยอดขาย (บาท)', 'ยอดขาย', 'มูลค่าสินค้า']));
                    const item = {
                        monthText: monthLabelFromDate(date),
                        dateText,
                        jobId,
                        customerName: findField(customer, ['ชื่อลูกค้า', 'ชื่อ']) || '-',
                        plate: findField(booking, ['ทะเบียนรถ', 'ทะเบียน']),
                        carModel: findField(booking, ['รุ่นรถยนต์', 'รุ่นรถ']),
                        customerType: findField(booking, ['ประเภทลูกค้า']),
                        film: getFilmName(detail, booking),
                        position,
                        sqf: sizeInfo.sqf,
                        glassSize: sizeInfo.sizeText,
                        damageValue,
                        installer: installerNames.join(', ') || (detail && findField(detail, ['ทีมช่าง', 'ช่างติดตั้ง', 'ช่าง'])) || '-',
                        reasonText: reasonText || (detail ? 'ยังไม่ระบุเหตุผล' : 'ยังไม่มี data'),
                        note: (detail && findField(detail, ['หมายเหตุ'])) || findField(booking, ['หมายเหตุ']),
                        hasDetail: Boolean(detail),
                        date,
                        monthKey: monthKeyFromDate(date),
                        dateKey: dateKeyFromDate(date)
                    };
                    item.searchText = Object.values(item).join(' ').toLowerCase();
                    return item;
                });
            }).filter(item => item.jobId && String(item.reasonText).includes('(ช่าง)'));
        }

return { buildDamageRows };
})();