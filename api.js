'use strict'

const createHafas = require('db-hafas')
const createApi = require('hafas-rest-api')
const createHealthCheck = require('hafas-client-health-check')
const Redis = require('ioredis')
const withCache = require('cached-hafas-client')
const redisStore = require('cached-hafas-client/stores/redis')
const {join: pathJoin} = require('path')
const serveStatic = require('serve-static')
const pkg = require('./package.json')
const stations = require('./routes/stations')
const station = require('./routes/station')
const journeys = require('./routes/journeys')

const docsRoot = pathJoin(__dirname, 'docs')

const berlinHbf = '8011160'

let hafas = createHafas(pkg.name)
let healthCheck = createHealthCheck(hafas, berlinHbf)

if (process.env.REDIS_URL) {
	const redis = new Redis(process.env.REDIS_URL || null)
	hafas = withCache(hafas, redisStore(redis), {
		cachePeriods: {
			locations: 6 * 60 * 60 * 1000, // 6h
		},
	})

	const checkHafas = healthCheck
	const checkRedis = () => new Promise((resolve, reject) => {
		setTimeout(reject, 1000, new Error('didn\'t receive a PONG'))
		redis.ping().then(
			res => resolve(res === 'PONG'),
			reject,
		)
	})
	healthCheck = async () => (
		(await checkHafas()) === true &&
		(await checkRedis()) === true
	)
}

const modifyRoutes = (routes, hafas, config) => {
	routes['/stations/:id'] = station
	routes['/stations'] = stations
	routes['/journeys'] = journeys(hafas, config)
	return routes
}

const config = {
	hostname: process.env.HOSTNAME || 'localhost',
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	name: pkg.name,
	description: pkg.description,
	homepage: pkg.homepage,
	version: pkg.version,
	docsLink: 'https://github.com/derhuerst/db-rest/blob/5/docs/readme.md',
	openapiSpec: true,
	logging: true,
	aboutPage: false,
	etags: 'strong',
	csp: `default-src 'none' style-src 'self' 'unsafe-inline' img-src https:`,
	healthCheck,
	modifyRoutes,
}

const api = createApi(hafas, config, (api) => {
	api.use('/', serveStatic(docsRoot, {
		extensions: ['html', 'htm'],
	}))
})

module.exports = {
	config,
	api,
}
