/**
 * Created by Mat on 20/02/2016.
 */
(function(){
    'use strict';
    angular
        .module('aikuma-service', [])
        .factory('keyService', [function () {
            var ser = {};
            var subscribers = [];
            ser.regKey= function(keypress,keypresstype, callback) {
                subscribers.push({'keypress':keypress,'keypresstype':keypresstype, 'callback': callback});
            };
            ser.clearKey = function(keypress, keypresstype) {
                var max = subscribers ? subscribers.length : 0;
                for (var i = 0; i < max; i += 1) {
                    if (subscribers[i].keypress === keypress && subscribers[i].keypresstype === keypresstype) {
                        subscribers.splice(i, 1);
                        break;
                    }
                }
            };
            ser.handleKey = function(ev) {
                subscribers.forEach(function(sub){
                    if (ev.type === sub.keypresstype && ev.keyCode === sub.keypress) {
                        sub.callback(ev);
                        ev.preventDefault();
                    }
                });
            };
            ser.clearAll = function() {
                subscribers = [];
            };
            return ser;
        }])
        .factory('aikumaService', [function () {
            var ser = {};
            ser.languages = [];
            ser.langOverrides = [
                {
                    Ref_Name: '中文',
                    Id: 'cmn'
                },
                {
                    Ref_Name: '漢語',
                    Id: 'cmn'
                },
                {
                    Ref_Name: '台語',
                    Id: 'nan'
                },
                {
                    Ref_Name: '賽夏語',
                    Id: 'xsy'
                },
                {
                    Ref_Name: '泰雅語',
                    Id: 'tay'
                }

            ];
            ser.getLanguages = function(callback) {
                Papa.parse("extdata/iso-639-3_20160115.tab", {
                    header: true,
                    download: true,
                    complete: function(results) {
                        ser.languages = results.data;
                        angular.extend(ser.languages,ser.langOverrides)
                        callback(results.data);
                    }
                });
            };

            ser.lookupLanguage = function(id, langList) {
                var flang = _.find(langList, function(lang) {
                    return lang.Id === id;
                });
                if (!flang) {return {short: id, full: id};}
                return {short: flang.Ref_Name, full: flang.Ref_Name + ' (' + id + ')'};
            };

            ser.mockannotations = [
                {
                    'type': 'annotation',
                    'langStr': 'English',
                    'langISO': 'en',
                    'SegId': 'seg1',
                    'annos': ['This is a bit of English', 'and a little bit more']
                },
                {
                    'type': 'translation',
                    'langStr': 'Chinese Mandarin',
                    'langISO': 'cmn',
                    'SegId': 'seg2',
                    'annos': ['這是一段中文', '也多一小段']
                }
            ];
            ser.mocksegMap = {
                'seg1': [
                    {
                        'source': [0, 2000],
                        'map': null
                    },
                    {
                        'source': [2500, 4000],
                        'map': null
                    }
                ],
                'seg2': [
                    {
                        'source': [0, 2000],
                        'map': null
                    },
                    {
                        'source': [2500, 4000],
                        'map': null
                    }
                ]
            };

            ser.getAnnotations = function() {
                return ser.mockannotations;
            };
            ser.getSegmap = function(id) {
                return ser.mocksegMap[id];
            };

            ser.exportAnno = function(segList, annoList, fileformat='webvtt') {
                var vtt = [];
                var fileExt;
                if (fileformat==='webvtt') {
                    vtt = ['WEBVTT \n\n'];
                    fileExt = 'vtt';
                } else {
                    fileExt = 'srt';
                }
                segList.forEach(function(seg, idx) {
                    vtt.push((idx + 1)+'\n');
                    var st_str = msToVtt(seg[0], fileformat);
                    var en_str = msToVtt(seg[1], fileformat);
                    vtt.push(st_str + ' --> ' + en_str + '\n');
                    annoList.forEach(function(anno){
                        if (anno[idx] !== undefined ) {
                            vtt.push(anno[idx] + '\n');
                        }
                    });
                    vtt.push('\n');
                });
                var blob = new Blob(vtt, {type: "text/plain;charset=utf-8"});
                var a = document.createElement("a");
                document.body.appendChild(a);
                a.style = "display: none";
                var url = window.URL.createObjectURL(blob);
                a.href = url;
                a.download = 'annotation.' + fileExt;
                a.click();
                window.URL.revokeObjectURL(url);
                return vtt;
            };

            function msToVtt(ms, fileformat) {
                var dotcomma;
                if (fileformat==='webvtt') {
                    dotcomma = '.';
                } else {
                    dotcomma = ',';
                }
                var milliseconds = parseInt(ms%1000);
                var seconds = parseInt((ms/1000)%60);
                var minutes = parseInt((ms/(1000*60))%60);
                var hours = parseInt((ms/(1000*60*60))%24);
                return pad(hours,2) + ':' + pad(minutes,2) + ':' + pad(seconds,2) + dotcomma + pad(milliseconds % 1000,3);
            }

            function pad(n, width, z) {
                z = z || '0';
                n = n + '';
                return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
            }


            return ser;
        }]);


})();
