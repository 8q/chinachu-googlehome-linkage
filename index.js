const https = require('https');
const moment = require('moment-timezone');
moment.tz.setDefault("Asia/Tokyo");

const build_options = (path) => {
    return {
        hostname: process.env.HOSTNAME,
        path: path,
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' +
                new Buffer(process.env.USERNAME + ':' + process.env.PASSWORD).toString('base64')
        }
    };
};

const dayword2offset = (w) => {
    return {
        "今日": 0,
        "昨日": -1,
        "明日": 1,
        "一昨日": -2,
        "明後日": 2
    }[w];
};

const get_json_data = async (target) => {
    return new Promise((resolve, reject) => {
        https.request(build_options(`/api/${target}.json`), (res) => {
            res.setEncoding('utf8');
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve(JSON.parse(body));
            });
        }).on('error', (e) => {
            reject(e);
        }).end();
    });
};

const build_response = (message) => {
    // return { fulfillmentText: message };
    return {
        payload: {
            google: {
                expectUserResponse: false,
                richResponse: {
                    items: [
                        {
                            simpleResponse: {
                                textToSpeech: message
                            }
                        }
                    ]
                }
            }
        }
    };
};

exports.handler = async (event) => {
    const [reserves, recording, recorded] =
        await Promise.all([get_json_data('reserves'), get_json_data('recording'), get_json_data('recorded')]);

    const dayword = event.queryResult.parameters.dayword;
    const offset = dayword2offset(dayword);
    const ops = { 'hour': 5, 'minute': 0, 'second': 0, 'millisecond': 0 };
    const from_epochmills = moment().add(offset, 'd').set(ops).valueOf();
    const to_epochmills = moment().add(offset + 1, 'd').set(ops).valueOf();

    const target_programs_info = [].concat(recorded).concat(recording).concat(reserves)
        .filter(e => e.start >= from_epochmills && e.start < to_epochmills)
        .map(e => {
            return {
                channel: e.channel.name,
                title: e.title + (e.episode !== null ? ` ${e.episode}話` : ''),
                start: moment(e.start).format('H時m分')
            };
        });

    let message = '';
    if (target_programs_info.length > 0) {
        message = `${dayword}は` + target_programs_info.map(e => `${e.start}から${e.channel}で${e.title}`).join('、') + 'です。';
    } else {
        message = `${dayword}の番組が見つかりませんでした。`;
    }

    return build_response(message);
};
