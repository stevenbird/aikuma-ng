(function() {
    'use strict';
    var USER_TYPE='user', SESSION_TYPE='session', SECONDARY_TYPE='secondary';
    var SPEAKER_ROLE = 'speakers';
    
    angular
        .module('aikuma-dataservice', [])
        .factory('aikumaUtils', function() {
            var NUMBER = '0123456789',
                LOWER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz',
                UPPER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

            return {
                createRandomAlphabets: function(length) {
                    var id = '';
                    for(var i = 0; i < length; i++) {
                        id += UPPER_ALPHABET.charAt(Math.floor(Math.random() * UPPER_ALPHABET.length));
                    }
                    return id;
                },
                createRandomNumbers: function(length) {
                    var id ='';
                    for(var i = 0; i < length; i++) {
                        id += NUMBER.charAt(Math.floor(Math.random() * NUMBER.length));
                    }
                    return id;
                }
            };
        })
        .factory('loginService', ['$translate', 'dataService', function ($translate, dataService) {
            var loginStatus = false;
            var currentUserData;
            
            if(window.sessionStorage && window.sessionStorage.currentUserData) {
                loginStatus = true;
                currentUserData = JSON.parse(window.sessionStorage.currentUserData);
                console.log('loginService: ' + currentUserData.email);
            }
            
            var service = {};
            
            service.loginPreviousUser = function() {
                if(window.chrome && chrome.storage) 
                    chrome.storage.local.get('userId', function(obj) { service.loginUser(obj.userId); });
                else
                    service.loginUser(localStorage.getItem('userId'));
            };
            
            service.loginUser = function(userId) {
                if(!userId || userId.search(/^[A-Z]{12}$/) === -1)
                    return;
                
                dataService.get(USER_TYPE, userId).then(function(userObj) {
                    loginStatus = true;
                    currentUserData = userObj.data;
                    $translate.use(userObj.data.preferences.langCode);
                    if(window.sessionStorage)
                        window.sessionStorage.currentUserData = JSON.stringify(currentUserData);
                    if(window.chrome && chrome.storage)
                        chrome.storage.local.set({userId: currentUserData._ID});
                    else
                        localStorage.setItem('userId', currentUserData._ID);
                    
                });
            };
            
            service.logout = function() {
                loginStatus = false;
                currentUserData = null;
                if(window.sessionStorage)
                    window.sessionStorage.removeItem('currentUserData');
                if(window.chrome && chrome.storage)
                    chrome.storage.local.remove('userId');
                else
                    localStorage.removeItem('userId');
            };
            
            service.getLoginStatus = function() {
                return loginStatus;
            };
            
            service.getLoggedinUserId = function() {
                if(currentUserData)
                    return currentUserData._ID;
                else
                    return null;
            };

            return service;
        }])
        .factory('dataService', ['$q', '$indexedDB', 'aikumaUtils', function($q, $indexedDB, aikumaUtils){
            // id, lastModified is automatically created
            var dataModel = {
                user: {
                    _ID: true,
                    names: true,    // array
                    email: true,
                    lastModified: true,
                    preferences: true,
                    people: false,  // array
                    tags: false,    // array
                    files: false    // array
                },
                session: {
                    _ID: true,
                    names: true,    // array
                    type: true,
                    lastModified: true,
                    source: true,
                    creatorId: true,
                    olac: false,
                    details: false,  // mat: array of objects
                    roles: false,   // object of array
                    tagIds: false,  // array
                    imageIds: false,  // object of array
                    segments: false,  // object of array
                    
                    userId: true,
                },
                secondary: {
                    _ID: true,
                    names: true,    // array
                    type: true,
                    lastModified: true,
                    source: true,
                    creatorId: true,
                    segment: true,
                    details: false,
                    
                    userId: true,
                    sessionId: true
                },
                
                // Embedded object model
                person: {
                    _ID: true,
                    names: true,    // array
                    email: false,
                    imageFileId: false
                },
                tag: {
                    _ID: true,
                    name: true
                },
                source: {
                    recordFileId: true,
                    langIds: true,
                    created: true,
                    duration: true,
                    
                    sampleRate: false,      // for continuous save of respeak
                    sampleLength: false     // for continuous save of respeak
                },
                segment: {
                    sourceSegId: true,
                    segArray: true
                },
                file: {
                    _ID: true,
                    url: true,
                    type: true,
                    description: false,
                }
            };
            
            var validation = {
                validateRequired: function(type, data) {
                    // Type check
                    if(Object.keys(dataModel).indexOf(type) == -1) {
                        return 'The dataModel(' + type +') does not exist in the models: ' + Object.keys(dataModel);
                    }
                    
                    // Key check
                    var model = dataModel[type];
                    var keys = Object.keys(data);
                    for(var prop in model) {
                        var keyIdx = keys.indexOf(prop);
                        
                        if(keyIdx != -1)
                            keys.splice(keyIdx, 1);
                        else if(model[prop])
                            return prop + ' is a required field for the dataModel: ' + type;
                    }
                    
                    if(keys.length > 0)
                        return keys + ' are not the possible fields for the dataModel: ' + type;
                    else
                        return '';
                },
                validateType: function(type) {
                    return ([USER_TYPE, SESSION_TYPE, SECONDARY_TYPE].indexOf(type) != -1);
                }
            };
            
            var dataMethods = {
                addUserMeta: function(metaKey) {
                    return function(metaObj) {
                        var id = this.data._ID + aikumaUtils.createRandomNumbers(12);
                        // If this metadata doesn't exist
                        if(!this.data[metaKey])
                            this.data[metaKey] = {};
                        this.data[metaKey][id] = metaObj;
                        
                        return id;
                    };
                },
                setUserMeta: function(metaKey) {
                    return function(id, metaObj) {
                        if(!this.data[metaKey])
                            this.data[metaKey] = {};
                        this.data[metaKey][id] = metaObj;
                    }; 
                },
                getMetaWithId: function(metaKey, prop) {
                    return function(id) {
                        if(this.data[metaKey]) {
                            if(prop && this.data[metaKey][id])
                                return this.data[metaKey][id][prop];
                            else
                                return this.data[metaKey][id];
                        } else {
                            return undefined;
                        }
                    };
                },
                pushMeta: function(metaKey) {
                    return function(metaObj) {
                        if(!this.data[metaKey])
                            this.data[metaKey] = [];
                        this.data[metaKey].push(metaObj);
                    };
                },
                save: function(type) {
                    return function() {
                        if(type === USER_TYPE) {
                            return service.updateUser(this.data._ID, this.data);
                        } else if(type === SESSION_TYPE) {
                            return service.updateSession(this.data._ID, this.data);
                        } else if(type === SECONDARY_TYPE) {
                            return service.updateSecondary(this.data._ID, this.data);
                        }
                    };
                }
            };
            
            var dbOps = {
                set: function(type, id, data, store) {
                    data['_ID'] = id;
                    data.lastModified = Date.now();
                    
                    var msg = validation.validateRequired(type, data);
                    if(msg) {
                        throw 'Validation Error: ' + msg;
                    }
                    return store.upsert(data);
                },
                remove: function(type, id, store) {       
                    return store.delete(id);
                },
                get: function(type, id, store) {
                    return store.find(id);
                }
            };
               
            var service = {};
            service.setUser = function(data) {
                //var id = data.email;
                var id = aikumaUtils.createRandomAlphabets(12);
                
                return $indexedDB.openStore(USER_TYPE, function(store) {
                   return dbOps.set(USER_TYPE, id, data, store); 
                });
            };
            
            service.setSession = function(userId, data) {
                var id = aikumaUtils.createRandomAlphabets(12);
                data['userId'] = userId;
                data['type'] = SESSION_TYPE;
                
                return $indexedDB.openStores([USER_TYPE, SESSION_TYPE], function(store0, store1) {
                    return dbOps.get(null, userId, store0).then(function() {    // validation
                        return dbOps.set(SESSION_TYPE, id, data, store1);  
                    });
                });
            };
            
            service.setSecondary = function(userId, sessionId, data) {
                var id = sessionId + aikumaUtils.createRandomNumbers(6);
                data['userId'] = userId;
                data['sessionId'] = sessionId;
                
                return $indexedDB.openStores([USER_TYPE, SESSION_TYPE, SECONDARY_TYPE], function(store0, store1, store2) {
                    return dbOps.get(null, userId, store0).then(function() {    // validation
                        return dbOps.get(null, sessionId, store1);
                    }).then(function() {
                        return dbOps.set(SECONDARY_TYPE, id, data, store2);
                    });
                });
            };
            
            service.updateUser = function(userId, data) {
                return $indexedDB.openStore(USER_TYPE, function(store) {
                    return dbOps.get(null, userId, store).then(function() {     // validation
                        return dbOps.set(USER_TYPE, userId, data, store);
                    });
                });
            };
            
            service.updateSession = function(sessionId, data) {
                return $indexedDB.openStore(SESSION_TYPE, function(store) {
                    return dbOps.get(null, sessionId, store).then(function() {     // validation
                      return dbOps.set(SESSION_TYPE, sessionId, data, store);  
                    });
                });
            };
            service.updateSecondary = function(secId, data) {
                return $indexedDB.openStore(SECONDARY_TYPE, function(store) {
                    return dbOps.get(null, secId, store).then(function() {      // validation
                        return dbOps.set(SECONDARY_TYPE, secId, data, store);
                    });
                });
            };
            
            service.remove = function(type, id) {
                return $indexedDB.openStore(type, function(store) {
                   return dbOps.remove(null, id, store); 
                });
            };
            
            var cachedWrappers = {};
            service.get = function(type, id) {
                var dataDefer = $q.defer();
                
                var cacheKey = type + id;
                if(cacheKey in cachedWrappers) {
                    dataDefer.resolve(cachedWrappers[cacheKey]);
                } else {
                    $indexedDB.openStore(type, function(store) {
                        return dbOps.get(null, id, store);
                    }).then(function(data) {
                        var wrapper = {data: data};
                        if(type === USER_TYPE) {
                            wrapper.getFileUrl = dataMethods.getMetaWithId('files', 'url').bind(wrapper);
                            wrapper.addUserTag = dataMethods.addUserMeta('tags').bind(wrapper);
                            wrapper.addUserPerson = dataMethods.addUserMeta('people').bind(wrapper);
                            wrapper.addUserFile = dataMethods.addUserMeta('files').bind(wrapper);
                            wrapper.save = dataMethods.save(USER_TYPE).bind(wrapper);
                        } else if(type === SESSION_TYPE) {
                            wrapper.setSrcSegment = dataMethods.setUserMeta('segments').bind(wrapper);
                            wrapper.addSrcSegment = dataMethods.addUserMeta('segments').bind(wrapper);
                            wrapper.pushDetail = dataMethods.pushMeta('details').bind(wrapper);
                            wrapper.save = dataMethods.save(SESSION_TYPE).bind(wrapper);
                        } else if(type === SECONDARY_TYPE) {
                            wrapper.save = dataMethods.save(SECONDARY_TYPE).bind(wrapper);
                            
                            //annotation
                            if(data.type.indexOf('anno_') === 0) {
                                
                            }
                            //other secondary
                        }

                        if(!cachedWrappers[cacheKey])
                            cachedWrappers[cacheKey] = wrapper;
                        dataDefer.resolve(cachedWrappers[cacheKey]);
                    }).catch(function(err) {
                       dataDefer.reject(err); 
                    });
                }
                
                return dataDefer.promise;
            };
            
            service.getUserList = function() {
                return $indexedDB.openStore(USER_TYPE, function(store) {
                    return store.getAll();
                });
            };
            
            service.getSessionList = function(userId) {
                return $indexedDB.openStore(SESSION_TYPE, function(store) {
                    return store.eachBy('user_idx', {beginKey: userId, endKey: userId});
                }).then(function(sessionList) {
                    if(sessionList) {
                        sessionList.sort(function (a, b) {
                            return new Date(b.lastModified) - new Date(a.lastModified);
                        });
                    }
                    return sessionList;
                });
            };
            
            service.getSecondaryList = function(userId, sessionId) {
                return $indexedDB.openStore(SECONDARY_TYPE, function(store) {
                    return store.eachBy('user_session_idx', {beginKey: [userId, sessionId], endKey: [userId, sessionId]});
                }).then(function(secList) {
                    if(secList) {
                        secList.sort(function (a, b) {
                            return new Date(a.source.created) - new Date(b.source.created);
                        });
                    }
                    return secList;
                });
            };
            
            service.getAnnotationObjList = function(userId, sessionId) {
                return service.getSecondaryList(userId, sessionId).then(function(secList) {
                    return secList.filter(function(secData){
                        return secData.type.indexOf('anno_') === 0;
                    }).sort(function(a, b){
                        return new Date(a.source.created) - new Date(b.source.created);
                    }).map(function(secData) { 
                        var wrapper = {data: secData};
                        wrapper.save = dataMethods.save(SECONDARY_TYPE).bind(wrapper);
                        return wrapper;
                    });
                });
            };
            
            service.getSecondaryDict = function(userId, sessionId, secType, transformFunc) {
                return $indexedDB.openStore(SECONDARY_TYPE, function(store) {
                    return store.eachBy('user_session_idx', {beginKey: [userId, sessionId], endKey: [userId, sessionId]});
                }).then(function(secList) {
                    var secDict = {};
                    secList.forEach(function(secData) {
                        if(!secType || secData.type.indexOf(secType) === 0) {
                            if(transformFunc) {
                                secDict[secData._ID] = transformFunc(secData);
                            } else {
                                secDict[secData._ID] = secData;
                            }
                        }
                    });
                    return secDict;
                });
            };
            
            service.getAnnotationObjDict = function(userId, sessionId) {
                return service.getSecondaryDict(userId, sessionId, 'anno_', function(secData) {
                    var wrapper = {data: secData};
                    wrapper.save = dataMethods.save(SECONDARY_TYPE).bind(wrapper);
                    return wrapper;
                });
            };
            
            // Temporary metadata
            
            var getTempStorageKey = function(userId, sessionId, type) {
                return userId + sessionId + type;
            };
            
            service.setTempJsonObj = function(userId, sessionId, type, obj) {
                if(window.sessionStorage) {
                    var key = getTempStorageKey(userId, sessionId, type);
                    window.sessionStorage[key] = JSON.stringify(obj);
                }
            };
            
            service.deleteTempJsonObj = function(userId, sessionId, type) {
                if(window.sessionStorage) {    
                    var key = getTempStorageKey(userId, sessionId, type);
                    window.sessionStorage.removeItem(key);
                }
            };
            
            service.getTempJsonObj = function(userId, sessionId, type) {
                if(window.sessionStorage) {
                    var key = getTempStorageKey(userId, sessionId, type);
                    if(window.sessionStorage[key])
                        return JSON.parse(window.sessionStorage[key]);
                    else
                        return null;
                }
            };
            
            // Language
            var langDefer = $q.defer();
            
            Papa.parse("extdata/iso-639-3_20160115.tab", {
                header: true,
                download: true,
                error: function(err, file, inputElem, reason) {
                    langDefer.reject(err, ': ', reason);
                },
                complete: function(results) {
                    langDefer.resolve(results.data);
                }
            });
            
            service.getLanguages = function() {
                return langDefer.promise;
            };
            
            // Backup/Import DB
            service.getJsonBackup = function() {
                var backup = {};
                return $indexedDB.openStores([USER_TYPE, SESSION_TYPE, SECONDARY_TYPE], function(store0, store1, store2) {
                    return store0.getAll().then(function(userData) {
                        backup[USER_TYPE] = userData;
                        return store1.getAll();
                    }).then(function(sessionData) {
                        backup[SESSION_TYPE] = sessionData;
                        return store2.getAll();
                    }).then(function(secondaryData) {
                        backup[SECONDARY_TYPE] = secondaryData;
                        return backup;
                    });
                });
            };
            
            service.clear = function() {
                return $indexedDB.openStores([USER_TYPE, SESSION_TYPE, SECONDARY_TYPE], function(store0, store1, store2) {
                    return store0.clear().then(function() {
                        return store1.clear();
                    }).then(function() {
                        return store2.clear();
                    });
                });
            };
            
            service.importJsonDb = function(jsonDbStr, fileIdMap) {
                var dbObj = JSON.parse(jsonDbStr);
                
                // Change users' files' urls
                dbObj[USER_TYPE].forEach(function(userData) {
                    if(userData.files) {
                        for(var fileId in userData.files) {
                            var fileData = userData.files[fileId];
                            var key = fileData.url.match(/[^/]+\/[^/]+\..+$/i)[0];
                            if(fileIdMap[key]) {
                                //console.log(fileData.url, ';', key, '; ', fileIdMap[key]);
                                fileData.url = fileIdMap[key];
                            }
                        }
                    }
                });
                
                // Import DB
                return $indexedDB.openStores([USER_TYPE, SESSION_TYPE, SECONDARY_TYPE], function(store0, store1, store2) {
                    return store0.upsert(dbObj[USER_TYPE]).then(function() {
                        return store1.upsert(dbObj[SESSION_TYPE]);
                    }).then(function() {
                        return store2.upsert(dbObj[SECONDARY_TYPE]);
                    });
                });
            };
            
            return service;
        }])
        .factory('fileService', ['config', '$q', 'aikumaUtils', 'dataService', function(config, $q, aikumaUtils, dataService) {
            window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
            window.resolveLocalFileSystemURL = window.resolveLocalFileSystemURL || window.webkitResolveLocalFileSystemURL;

            var rootFs = $q.defer();
            var currentUserId;
            var validation = {
                validateUserId: function(userId, bypass) {
                    var userIdValidationDefer = $q.defer();

                    if(currentUserId === userId) {
                        userIdValidationDefer.resolve();
                    } else if(bypass) {
                        currentUserId = userId;
                        service.createFolder(userId).then(function() {
                            userIdValidationDefer.resolve();
                        }).catch(function(err) {
                            userIdValidationDefer.reject(err);
                        });
                    } else {
                        dataService.get(USER_TYPE, userId).then(function() {
                            currentUserId = userId;
                            service.createFolder(userId).then(function() {
                                userIdValidationDefer.resolve();
                            }).catch(function(err) {
                                userIdValidationDefer.reject(err);
                            });
                        }).catch(function(err) {
                            userIdValidationDefer.reject(err);
                        });
                    }

                    return userIdValidationDefer.promise;
                }
            };

            var onInitFs = function (fs) {
                console.log('Opened file system: ' + fs.name);
                rootFs.resolve(fs);
            };

            var onErrorFs = function(e) {
                var msg = '';

                switch (e.code) {
                    case FileError.QUOTA_EXCEEDED_ERR:
                        msg = 'QUOTA_EXCEEDED_ERR';
                        break;
                    case FileError.NOT_FOUND_ERR:
                        msg = 'NOT_FOUND_ERR';
                        break;
                    case FileError.SECURITY_ERR:
                        msg = 'SECURITY_ERR';
                        break;
                    case FileError.INVALID_MODIFICATION_ERR:
                        msg = 'INVALID_MODIFICATION_ERR';
                        break;
                    case FileError.INVALID_STATE_ERR:
                        msg = 'INVALID_STATE_ERR';
                        break;
                    default:
                        msg = 'Unknown Error';
                        break;
                }
                rootFs.reject('Error: ' + msg);
            };

            navigator.webkitPersistentStorage.requestQuota(config.fileStorageMB*1024*1024, function(bytes) {
                window.requestFileSystem(window.PERSISTENT, bytes, onInitFs, onErrorFs);
            }, function(err) {
                rootFs.reject('Error: ' + err);
            });

            var service = {};
            service.getFileEntryFromName = function(userId, fileName, options) {
                var fileDefer = $q.defer();
                var filePath = userId + '/' + fileName;
                var fileOption = options || {create: false};

                rootFs.promise.then(function(fs) {
                    fs.root.getFile(filePath, options, function(fileEntry) {
                        fileDefer.resolve(fileEntry);
                    }, function(err) {
                        fileDefer.reject(err);
                    });
                }).catch(function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;
            };

            service.getFileFromName = function(userId, fileName) {
                var fileDefer = $q.defer();

                service.getFileEntryFromName(userId, fileName).then(function(fileEntry) {
                    fileEntry.file(function(file) {
                        fileDefer.resolve(file);
                    }, function(err) {
                        fileDefer.reject(err);
                    });
                }).catch(function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;
            };

            service.getFileEntry = function(url) {
                var fileDefer = $q.defer();

                window.resolveLocalFileSystemURL(url, function(fileEntry) {
                    fileDefer.resolve(fileEntry);
                }, function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;
            };

            service.getFile = function(url) {
                var fileDefer = $q.defer();

                service.getFileEntry(url).then(function(fileEntry) {
                    fileEntry.file(function(file) {
                        fileDefer.resolve(file);
                    }, function(err) {
                        fileDefer.reject(err);
                    });
                }).catch(function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;
            };

            service.createFolder = function(userId) {
                var folderDefer = $q.defer();

                validation.validateUserId(userId).then(function() {
                    rootFs.promise.then(function(fs) {
                        fs.root.getDirectory(userId, {create: true}, function(dirEntry) {
                            folderDefer.resolve(dirEntry);
                        }, function(err) {
                            folderDefer.reject(err);
                        }) ; 
                    }).catch(function(err) {
                        folderDefer.reject(err);
                    });
                }).catch(function(err) {
                    folderDefer.reject(err);
                });

                return folderDefer.promise;
            };
            
            var wavHeaderBuf = new ArrayBuffer(8);
            var postprocessFuncs = {};
            postprocessFuncs['audio/wav'] = function(fileWriter, step, byteBuf) {
                switch(step) {
                    case 2:
                        fileWriter.seek(4);
                        fileWriter.write(new Blob([byteBuf.slice(0, 4)]));
                        break;
                    case 1:
                        fileWriter.seek(40);
                        fileWriter.write(new Blob([byteBuf.slice(4, 8)]));
                        break;
                }
            };
            service.writeFileToEntry = function(fileEntry, file, step, pos) {
                var fileDefer = $q.defer();
                
                fileEntry.createWriter(function(fileWriter) {
                    fileWriter.onwriteend = function() {
                        if(pos) {
                            fileWriter.seek(pos);
                            pos = 0;
                            fileWriter.write(file);
                        } else if(step) {
                            postprocessFuncs[file.type](fileWriter, step--, wavHeaderBuf);
                        } else {
                            fileDefer.resolve(fileEntry.toURL());
                        }
                    };

                    fileWriter.onerror = function(err) {
                        fileDefer.reject(err);
                    };

                    if(pos) {
                        fileWriter.truncate(pos);
                    } else {
                        fileWriter.write(file);
                    }
                }, function(err) {
                    fileDefer.reject(err);
                });
                
                return fileDefer.promise;
            };
            service.writeFile = function(url, file, pos) {
                var fileDefer = $q.defer();
                var step = 0;
                
                if(pos < 0) {
                    return;
                } else if(file.type === 'audio/wav') {
                    step = 2;
                    var view = new DataView(wavHeaderBuf);
                    view.setUint32(0, (pos + file.size) - 8, true);
                    view.setUint32(4, (pos + file.size) - 44, true);
                }
                
                service.getFileEntry(url).then(function(fileEntry) {
                    return service.writeFileToEntry(fileEntry, file, step, pos);
                }).then(function(url){
                    fileDefer.resolve(url);
                }).catch(function(err) {
                    fileDefer.reject(err);
                });
                
                return fileDefer.promise;
            };
            
            service.createFile = function(userId, file, bypass) {
                var fileDefer = $q.defer();

                if(!file.name) {
                    file.name = aikumaUtils.createRandomAlphabets(20);
                    if(file.type === 'audio/wav') {
                        file.name += '.wav';
                    } else if(file.type.indexOf('image') === 0) {
                        file.name += zip.getExtension(file.type);
                    }
                }
                
                validation.validateUserId(userId, bypass).then(function() {
                    service.getFileEntryFromName(userId, file.name, {create: true}).then(function(fileEntry) {
                        fileEntry.createWriter(function(fileWriter) {	
                            fileWriter.onwriteend = function() {					
                                fileDefer.resolve(fileEntry.toURL());
                            };

                            fileWriter.onerror = function(err) {
                                fileDefer.reject(err);
                            };

                            fileWriter.write(file);

                        }, function(err) {
                            fileDefer.reject(err);
                        });
                    }).catch(function(err) {
                        fileDefer.reject(err);
                    });
                }).catch(function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;
            };

            service.deleteFile = function(url) {
                var fileDefer = $q.defer();

                window.resolveLocalFileSystemURL(url, function(fileEntry) {
                    fileEntry.remove(function() {
                        fileDefer.resolve("deleted");
                    }, function(err) {
                        fileDefer.reject(err);
                    });
                }, function(err) {
                    fileDefer.reject(err);
                });

                return fileDefer.promise;    
            };
            
            // Get indexedDB backup
            // Import zip
            zip.workerScriptsPath = "src/lib/";
            service.getBackupFile = function(type) {
                var zipDefer = $q.defer();
                var backupFile = new zip.fs.FS();
                var jsonDb;
                dataService.getJsonBackup().then(function(dbBackup) {
                    jsonDb = dbBackup;
                    return rootFs.promise;
                }).then(function(fs) {
                    var onsuccess = function() {
                        switch(type) {
                            case 'uri':
                                backupFile.exportData64URI(function(uri) {
                                    zipDefer.resolve(uri);
                                }, null, function() { zipDefer.reject('no uri'); });
                                break;
                            case 'blob':
                                backupFile.exportBlob(function(blob) {
                                    zipDefer.resolve(blob);
                                }, null, function() { zipDefer.reject('no blob'); });
                                break;
                        }
                    };

                    var onerror = function() { 
                        zipDefer.reject('fileService.getBackupFile: Zipping Error'); 
                    };
                    //Sync
                    backupFile.root.addBlob('db.json', new Blob([JSON.stringify(jsonDb)], {type: 'application/json'}));
                    //Async
                    backupFile.root.addFileEntry(fs.root, onsuccess, onerror);
                }).catch(function(err) {
                    zipDefer.reject(err);
                });

                return zipDefer.promise;
            };
            
            service.clear = function() {
                var clearDefer = $q.defer();
                
                rootFs.promise.then(function(fs) {
                    var rootReader = fs.root.createReader();
                    rootReader.readEntries(function(entries) {
                        var i = 0;
                        var onerror = function() {
                            clearDefer.reject('failure');
                        };
                        var onsuccess = function() {
                            if(!entries[i]) {
                                clearDefer.resolve('success');
                            } else {
                                entries[i++].removeRecursively(onsuccess, onerror);
                            }
                        };
                        
                        if(entries.length !== 0) {
                            entries[i++].removeRecursively(onsuccess, onerror);
                        } else {
                            clearDefer.resolve('success');
                        }
                    });
                });
                    
                return clearDefer.promise;
            };

            service.importBackupFile = function(file) {
                var importDefer = $q.defer();
                var backupFile = new zip.fs.FS();
                var onerror = function() {
                    importDefer.reject('fileService.importBackupFile: Importing error');
                };

                backupFile.root.importBlob(file, function() {
                    if(file.name.indexOf('.zip') === -1)
                        return;

                    //var promises = [];
                    var userFileList = [];
                    var fileIdMap = {};
                    // Preprocessing
                    backupFile.root.children.forEach(function(childEntry) {
                        if(childEntry.directory) {
                            userFileList.push([childEntry.name, childEntry.children]);   
                        }
                    });

                    function importFile(userIndex, fileIndex) {
                        if(!userFileList[userIndex]) {     //Import JSON db after copy finishes
                            var dbFileEntry = backupFile.root.getChildByName('db.json');
                            dbFileEntry.getText(function(txt) {
                                //console.log(txt);
                                importDefer.resolve(dataService.importJsonDb(txt, fileIdMap));
                            });
                        } else {    // copy all users' files
                            var fileEntry = userFileList[userIndex][1][fileIndex];
                            if(!fileEntry) {
                                importFile(userIndex + 1, 0);
                            } else if(!fileEntry.directory) {
                                fileEntry.getBlob(zip.getMimeType(fileEntry.name), function(blob) {
                                    //promises.push(service.createFile(userFileList[userIndex][0], blob));
                                    service.createFile(userFileList[userIndex][0], blob, true).then(function(url) {
                                        fileIdMap[userFileList[userIndex][0] + '/' + fileEntry.name] = url;
                                        importFile(userIndex, fileIndex + 1);
                                    });
                                    //importFile(userIndex, fileIndex + 1);
                                });
                            }
                        }
                    }
                    
                    importFile(0, 0);
                    
                }, null, onerror);

                return importDefer.promise;
            };
            
            // Temporary storage
            var tempObj;
            service.setTempObject = function(obj) { tempObj = obj; };
            service.getTempObject = function() { return tempObj; };
            
            return service;

        }]);
    
})();