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
			pubtype: { 
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
			"pubtype", 
			"pubtitle",
			"pubvol"
		]	
	},
}

const book = {
	if: {
		properties: {
			pubtype: {
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
			"pubtype", 
			"publisher"
		]
	}
}

const chapter = {
	if: {
		properties: {
			pubtype: {
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
			"pubtype", 
			"pubtitle",
			"publisher",
			"editors"
		]
	},
}

const editedCollection = {
	if: {
		properties: {
			pubtype: {
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
			"pubtype", 
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
					pubtype: { 
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
						type: "string",
						default: "English"
					},
					comments: {type: "string"},
				},
				required: [
					"pubtype", 
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
					
					/*
					{
						if: {
							properties: {
								pubtype: { 
									const: "journal article" 
								},
							},
						},
						then: {
							properties: {
								pubtitle: {type: "string"},
								pubVol: {type: "string"},
								pubNo: {type: "string"},
							},
							required: [
								"pubtitle",
								"pubVol"
							]	
						},
					},
					{
						if: {
							properties: {
								pubtype: {
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
								"publisher"
							]
						}
					},
					*/
				],
			}
      	}
    }
}






