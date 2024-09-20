/*
//TODO: Old schema for test table. Delete at some point.
export const schema = {
    body: {
      type: 'object',
      properties: {
        reference: {
          type: "object",
          properties: {
            name: { type: 'string' },
            notes: { type: "string"}
          },
          required: ["name", "notes"]
        }
      }
    }
}
*/

const journalArticle = 	{
	if: {
		properties: {
			publication_type: { 
				const: "journal article" 
			},
		},
	},
	then: {
		properties: {
			pubtitle: {type: "string"},
			pubvol: {type: "string"},
			pubno: {type: "string"},
		},
		required: [
			"publication_type", 
			"pubtitle",
			"pubvol"
		]	
	},
}

const book = {
	if: {
		properties: {
			publication_type: {
				oneOf: [
					{const: "book"},
					{const: "serial monograph"},
					{const: "compendium"},
					{const: "Ph.D. thesis"},
					{const: "M.S. thesis"},
					{const: "guidebook"}
				]
			},
		},
	},
	then: {
		properties: {
			publisher: {type: "string"}
		},
		required: [
			"publication_type", 
			"publisher"
		]
	}
}

const chapter = {
	if: {
		properties: {
			publication_type: {
				const: "book chapter"
			},
		},
	},
	then: {
		properties: {
			pubtitle: {type: "string"},
			publisher: {type: "string"},
			editors: {type: "string"}
		},
		required: [
			"publication_type", 
			"pubtitle",
			"publisher",
			"editors"
		]
	},
}

const editedCollection = {
	if: {
		properties: {
			publication_type: {
				const: "book/book chapter"
			}
		}
	},
	then: {
		properties: {
			publisher: {type: "string"},
			editors: {type: "string"}
		},
		required: [
			"publication_type", 
			"publisher",
			"editors"
		]	
	},
}


export const schema = {
    body: {
		type: 'object',
		properties: {
			reference: {
				type: "object",
				properties: {
					publication_type: { 
						enum: ["journal article","book","book chapter","book/book chapter","serial monograph","compendium","Ph.D. thesis","M.S. thesis","abstract","guidebook","news article","unpublished"]
					},
					reftitle: {type: "string"},
					author1init: {type: "string"},
					author1last: {type: "string"},
					author2init: {type: "string"},
					author2last: {type: "string"},
					otherauthors: {type: "string"},
					pubyr: {type: "string"},
					firstpage: {type: "string"},
					lastpage: {type: "string"},
					doi: {type: "string"},
					language: {
						enum: ['Chinese','English','French','German','Italian','Japanese','Portugese','Russian','Spanish','other','unknown'],
						default: "English"
					},
					comments: {type: "string"},
					upload: {
						enum: ['','YES']
					},
					classification_quality: {
						enum: ['authoritative','standard','compendium']
					},
					basis: {
						enum: ['','stated with evidence','stated without evidence','second hand','none discussed','not entered']
					},
					project_name: {
						enum: ['decapod','ETE','5%','1%','PACED','PGAP','fossil record']
					}
				},
				required: [
					"publication_type", 
					"reftitle", 
					"author1init",
					"author1last",
					"pubyr",
					"firstpage",
				],
				allOf: [
					journalArticle,
					book,
					chapter,
					editedCollection,
				],
			}
      	}
    }
}


export const getPropertiesForPubType = (pubType, fastify) => {
	fastify.log.trace("getPropertiesForPubType")
	fastify.log.trace(pubType)
	let allProps = Object.keys(schema.body.properties.reference.properties)
	let reqProps = schema.body.properties.reference.required
	fastify.log.trace(allProps)
	fastify.log.trace(reqProps)

	switch (pubType) {
		case "journal article": 
			allProps = allProps.concat(Object.keys(journalArticle.then.properties))
			reqProps = reqProps.concat(journalArticle.then.required)
			break;
		case "book":
		case "serial monograph":
		case "compendium":
		case "Ph.D. thesis":
		case "M.S. thesis":
		case "guidebook":
			allProps = allProps.concat(Object.keys(book.then.properties))
			reqProps = reqProps.concat(book.then.required)
			break;
		case "book chapter":
			allProps = allProps.concat(Object.keys(chapter.then.properties))
			reqProps = reqProps.concat(chapter.then.required)
			break;
		case "book/book chapter":
			allProps = allProps.concat(Object.keys(editedCollection.then.properties))
			reqProps = reqProps.concat(editedCollection.then.required)
			break;
	}

	return {
		allowedProps: new Set(allProps),
		requiredProps: reqProps
	}
}



