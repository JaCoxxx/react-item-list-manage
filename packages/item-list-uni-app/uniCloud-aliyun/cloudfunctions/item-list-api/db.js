// 数据库访问层: 封装 uniCloud 云数据库, 提供 D1-like 高级接口 + 视图聚合
// uniCloud 在云函数运行时全局注入, 直接使用

const { roundQuantity, todayDate, addDays } = require("./utils.js");

const db = uniCloud.database();
const _ = db.command;

// ---------- 基础 CRUD ----------
async function all(collection, where, options = {}) {
	let q = db.collection(collection);
	if (where && Object.keys(where).length > 0) {
		q = q.where(where);
	}
	if (options.orderBy) {
		for (const [field, dir] of options.orderBy) {
			q = q.orderBy(field, dir);
		}
	}
	if (options.limit) {
		q = q.limit(options.limit);
	}
	const res = await q.get();
	return res.data || [];
}

async function first(collection, where) {
	const res = await db.collection(collection).where(where).limit(1).get();
	return (res.data && res.data[0]) || null;
}

async function byId(collection, id) {
	const res = await db.collection(collection).doc(id).get();
	return (res.data && res.data[0]) || null;
}

async function insertOne(collection, doc) {
	return db.collection(collection).add(doc);
}

async function updateById(collection, id, patch) {
	return db.collection(collection).doc(id).update(patch);
}

async function updateWhere(collection, where, patch) {
	return db.collection(collection).where(where).update(patch);
}

async function deleteById(collection, id) {
	return db.collection(collection).doc(id).remove();
}

async function deleteWhere(collection, where) {
	return db.collection(collection).where(where).remove();
}

async function count(collection, where) {
	const res = await db.collection(collection).where(where || {}).count();
	return res.total || 0;
}

// 聚合求和: 满足 where 条件的文档中 field 之和
async function sumWhere(collection, where, field) {
	const res = await db.collection(collection)
		.aggregate()
		.match(where)
		.group({ _id: null, total: _.aggregate.sum("$" + field) })
		.end();
	return (res.data && res.data[0] && res.data[0].total) || 0;
}

// 按 groupField 分组求和 field, 返回 Map(groupField -> sum)
async function groupSum(collection, matchWhere, groupField, sumField) {
	const res = await db.collection(collection)
		.aggregate()
		.match(matchWhere)
		.group({ _id: "$" + groupField, total: _.aggregate.sum("$" + sumField) })
		.end();
	const map = new Map();
	for (const row of res.data || []) {
		map.set(row._id, row.total || 0);
	}
	return map;
}

// ---------- 视图聚合 (替代 SQL 视图) ----------

// 替代 batch_inventory_view 单行
async function getBatchInventory(batchId) {
	const batch = await byId("stock_batches", batchId);
	if (!batch) {
		return null;
	}
	const used = await sumWhere("stock_movements", {
		batch_id: batchId,
		movement_type: "OUT",
	}, "quantity");
	return {
		...batch,
		used_quantity: used,
		remaining_quantity: roundQuantity(batch.quantity - used),
	};
}

// 替代 item_inventory_view 单行
async function getItemInventory(itemId) {
	const batches = await all("stock_batches", { item_id: itemId });
	const usedByBatch = await groupSum(
		"stock_movements",
		{ item_id: itemId, movement_type: "OUT" },
		"batch_id",
		"quantity"
	);
	let current = 0;
	let nearest = null;
	let expired = 0;
	let expiring = 0;
	const today = todayDate();
	for (const b of batches) {
		const used = usedByBatch.get(b._id) || 0;
		const remaining = roundQuantity(b.quantity - used);
		if (remaining > 0) {
			current += remaining;
			if (b.expiry_date) {
				if (b.expiry_date < today) {
					expired++;
				} else if (b.expiry_date <= addDays(today, 7)) {
					expiring++;
				}
				if (nearest === null || b.expiry_date < nearest) {
					nearest = b.expiry_date;
				}
			}
		}
	}
	return {
		current_quantity: roundQuantity(current),
		nearest_expiry_date: nearest,
		expired_batch_count: expired,
		expiring_batch_count: expiring,
	};
}

async function getCurrentQuantity(itemId) {
	return (await getItemInventory(itemId)).current_quantity;
}

module.exports = {
	db,
	_,
	all,
	first,
	byId,
	insertOne,
	updateById,
	updateWhere,
	deleteById,
	deleteWhere,
	count,
	sumWhere,
	groupSum,
	getBatchInventory,
	getItemInventory,
	getCurrentQuantity,
};
