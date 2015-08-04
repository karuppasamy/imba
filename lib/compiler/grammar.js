(function(){


	function iter$(a){ return a ? (a.toArray ? a.toArray() : a) : []; };
	
	
	// The Imba parser is generated by [Jison](http://github.com/zaach/jison)
	// from this grammar file. Jison is a bottom-up parser generator, similar in
	// style to [Bison](http://www.gnu.org/software/bison), implemented in JavaScript.
	// It can recognize [LALR(1), LR(0), SLR(1), and LR(1)](http://en.wikipedia.org/wiki/LR_grammar)
	// type grammars. To create the Jison parser, we list the pattern to match
	// on the left-hand side, and the action to take (usually the creation of syntax
	// tree nodes) on the right. As the parser runs, it
	// shifts tokens from our token stream, from left to right, and
	// [attempts to match](http://en.wikipedia.org/wiki/Bottom-up_parsing)
	// the token sequence against the rules below. When a match can be made, it
	// reduces into the [nonterminal](http://en.wikipedia.org/wiki/Terminal_and_nonterminal_symbols)
	// (the enclosing name at the top), and we proceed from there.
	//
	// If you run the `cake build:parser` command, Jison constructs a parse table
	// from our rules and saves it into `lib/parser.js`.
	
	// The only dependency is on the **Jison.Parser**.
	
	var jison = require('../jison/jison');
	var Parser = jison.Parser;
	
	// Jison DSL
	// ---------
	
	// Since we're going to be wrapped in a function by Jison in any case, if our
	// action immediately returns a value, we can optimize by removing the function
	// wrapper and just returning the value directly.
	var unwrap = /^function\s*\(\)\s*\{\s*return\s*([\s\S]*);\s*\}/;
	
	// Our handy DSL for Jison grammar generation, thanks to
	// [Tim Caswell](http://github.com/creationix). For every rule in the grammar,
	// we pass the pattern-defining string, the action to run, and extra options,
	// optionally. If no action is specified, we simply pass the value of the
	// previous nonterminal.
	
	var o = function(patternString,action,options) {
		var match;
		patternString = patternString.replace(/\s{2,}/g,' ');
		var patternCount = patternString.split(' ').length;
		
		if (!action) { return [patternString,'$$ = $1;',options] };
		
		if (match = unwrap.exec(action)) {
			action = match[1];
		} else {
			action = ("(" + action + "())");
		};
		
		action = action.replace(/\bA(\d+)/g,'$$$1');
		action = action.replace(/\bnew /g,'$&yy.');
		action = action.replace(/\b(?:Block\.wrap|extend)\b/g,'yy.$&');
		action = action.replace(/\bAST\b/g,'yy');
		
		// really?
		// # should we always add locdata? does not work when statement)!
		// return [patternString, "$$ = #{loc(1, patternCount)}(#{action});", options]
		return [patternString,("$$ = " + action + ";"),options];
	};
	
	// Grammatical Rules
	// -----------------
	
	// In all of the rules that follow, you'll see the name of the nonterminal as
	// the key to a list of alternative matches. With each match's action, the
	// dollar-sign variables are provided by Jison as references to the value of
	// their numeric position, so in this rule:
	//
	//     "Expression UNLESS Expression"
	//
	// `A1` would be the value of the first `Expression`, `A2` would be the token
	// for the `UNLESS` terminal, and `A3` would be the value of the second
	// `Expression`.
	var grammar = {
		
		// The **Root** is the top-level node in the syntax tree. Since we parse bottom-up,
		// all parsing must end here.
		Root: [
			o('',function() {
				return new Root([]);
			}),
			o('Body',function() {
				return new Root(A1);
			}),
			o('Block TERMINATOR')
		],
		
		// Any list of statements and expressions, separated by line breaks or semicolons.
		Body: [
			o('BODYSTART',function() {
				return new Block([]);
			}),
			o('Line',function() {
				return new Block([A1]);
			}),
			// o 'HEADER Line' do Block.new([A2])
			// o 'LeadingTerminator' do Block.new([Terminator.new(A1)])
			o('Body Terminator Line',function() {
				return A1.break(A2).add(A3);
			}), // A3.prebreak(A2) # why not add as real nodes?!
			o('Body Terminator',function() {
				return A1.break(A2);
			})
		],
		
		Terminator: [
			o('TERMINATOR',function() {
				return new Terminator(A1);
			})
		],
		
		// An indented block of expressions. Note that the [Rewriter](rewriter.html)
		// will convert some postfix forms into blocks for us, by adjusting the
		// token stream.
		Block: [
			o('INDENT OUTDENT',function() {
				return new Block([]).indented(A1,A2);
			}),
			o('INDENT Body OUTDENT',function() {
				return A2.indented(A1,A3);
			}),
			// hacky way to support terminators at the start of blocks
			o('INDENT TERMINATOR Body OUTDENT',function() {
				return A3.prebreak(A2).indented(A1,A4);
			})
		],
		
		// Block and statements, which make up a line in a body.
		Line: [
			o('Splat'),
			o('Expression'),
			// o 'HEADER' do Terminator.new(A1)
			o('Line , Expression',function() {
				return A1.addExpression(A3);
			}), // Onto something??
			o('Line , Splat',function() {
				return A1.addExpression(A3);
			}), // Onto something?? # why is not splat an expression?
			o('Comment'),
			o('Statement')
		],
		
		// Pure statements which cannot be expressions.
		Statement: [
			o('Return'),
			o('Throw'),
			o('STATEMENT',function() {
				return new Literal(A1);
			}),
			
			o('BREAK',function() {
				return new BreakStatement(A1);
			}),
			o('BREAK CALL_START Expression CALL_END',function() {
				return new BreakStatement(A1,A3);
			}),
			
			o('CONTINUE',function() {
				return new ContinueStatement(A1);
			}),
			o('CONTINUE CALL_START Expression CALL_END',function() {
				return new ContinueStatement(A1,A3);
			}),
			
			o('DEBUGGER',function() {
				return new DebuggerStatement(A1);
			}),
			o('ImportStatement')
		],
		
		ImportStatement: [
			o('IMPORT ImportArgList FROM ImportFrom',function() {
				return new ImportStatement(A2,A4);
			}),
			o('IMPORT ImportFrom AS ImportArg',function() {
				return new ImportStatement(null,A2,A4);
			}),
			o('IMPORT ImportFrom',function() {
				return new ImportStatement(null,A2);
			})
		],
		
		ImportFrom: [
			o('STRING')
		],
		
		ImportArgList: [
			o('ImportArg',function() {
				return [A1];
			}),
			o('ImportArgList , ImportArg',function() {
				return A1.concat(A3);
			})
		],
		
		// Valid arguments are Blocks or Splats.
		ImportArg: [
			o('VarIdentifier')
		],
		
		// All the different types of expressions in our language. The basic unit of
		// Imba is the **Expression** -- everything that can be an expression
		// is one. Blocks serve as the building blocks of many other rules, making
		// them somewhat circular.
		Expression: [
			o('Await'),
			o('Value'),
			o('Code'),
			o('Operation'),
			o('Assign'),
			o('If'),
			o('Ternary'),
			o('Try'),
			o('While'),
			o('For'),
			o('Switch'),
			o('Class'), // statement, no?
			o('Module'),
			o('TagDeclaration'),
			o('Tag'),
			o('Property')
		],
		
		// A literal identifier, a variable name or property.
		Identifier: [
			o('IDENTIFIER',function() {
				return new Identifier(A1);
			})
		],
		
		// A literal identifier, a variable name or property.
		Ivar: [
			o('IVAR',function() {
				return new Ivar(A1);
			}),
			o('CVAR',function() {
				return new Ivar(A1);
			}) // kinda hacky, should be defined as something else
		],
		
		Gvar: [
			o('GVAR',function() {
				return new Gvar(A1);
			})
		],
		
		Const: [
			o('CONST',function() {
				return new Const(A1);
			})
		],
		
		Argvar: [
			o('ARGVAR',function() {
				return new Argvar(A1);
			})
		],
		
		Symbol: [
			o('SYMBOL',function() {
				return new Symbol(A1);
			})
		],
		
		
		// Alphanumerics are separated from the other **Literal** matchers because
		// they can also serve as keys in object literals.
		AlphaNumeric: [
			o('NUMBER',function() {
				return new Num(A1);
			}),
			o('STRING',function() {
				return new Str(A1);
			}),
			o('Symbol')
		],
		
		// All of our immediate values. Generally these can be passed straight
		// through and printed to JavaScript.
		Literal: [
			o('AlphaNumeric'),
			o('JS',function() {
				return new Literal(A1);
			}),
			o('REGEX',function() {
				return new RegExp(A1);
			}),
			o('BOOL',function() {
				return new Bool(A1);
			}),
			o('TRUE',function() {
				return AST.TRUE;
			}),
			o('FALSE',function() {
				return AST.FALSE;
			}),
			o('NULL',function() {
				return AST.NIL;
			}),
			o('UNDEFINED',function() {
				return AST.UNDEFINED;
			})
		// we loose locations for these
		],
		
		// A return statement from a function body.
		Return: [
			o('RETURN Expression',function() {
				return new Return(A2);
			}),
			o('RETURN Arguments',function() {
				return new Return(A2);
			}), // should probably force as array
			o('RETURN',function() {
				return new Return();
			})
		],
		
		TagSelector: [
			o('SELECTOR_START',function() {
				return new Selector([],{type: A1});
			}),
			o('TagSelector TagSelectorType',function() {
				return A1.add(new SelectorType(A2),'tag');
			}),
			o('TagSelector SELECTOR_NS',function() {
				return A1.add(new SelectorNamespace(A2),'ns');
			}),
			o('TagSelector SELECTOR_ID',function() {
				return A1.add(new SelectorId(A2),'id');
			}),
			o('TagSelector SELECTOR_CLASS',function() {
				return A1.add(new SelectorClass(A2),'class');
			}),
			o('TagSelector . { Expression }',function() {
				return A1.add(new SelectorClass(A4),'class');
			}),
			o('TagSelector # { Expression }',function() {
				return A1.add(new SelectorId(A4),'id');
			}),
			o('TagSelector SELECTOR_COMBINATOR',function() {
				return A1.add(new SelectorCombinator(A2),'sep');
			}),
			o('TagSelector SELECTOR_PSEUDO_CLASS',function() {
				return A1.add(new SelectorPseudoClass(A2),'pseudoclass');
			}),
			o('TagSelector SELECTOR_GROUP',function() {
				return A1.group();
			}),
			o('TagSelector UNIVERSAL_SELECTOR',function() {
				return A1.add(new SelectorUniversal(A2),'universal');
			}),
			o('TagSelector [ Identifier ]',function() {
				return A1.add(new SelectorAttribute(A3),'attr');
			}),
			o('TagSelector [ Identifier SELECTOR_ATTR_OP TagSelectorAttrValue ]',function() {
				return A1.add(new SelectorAttribute(A3,A4,A5),'attr');
			})
		],
		
		TagSelectorType: [
			o('SELECTOR_TAG',function() {
				return new TagTypeIdentifier(A1);
			})
		],
		
		Selector: [
			o('TagSelector SELECTOR_END',function() {
				return A1;
			})
		],
		
		TagSelectorAttrValue: [
			o('IDENTIFIER',function() {
				return A1;
			}),
			o('AlphaNumeric',function() {
				return A1;
			}),
			o('{ Expression }',function() {
				return A2;
			})
		],
		
		Tag: [
			o('TAG_START TagOptions TagAttributes TAG_END',function() {
				return A2.set({attributes: A3,open: A1,close: A4});
			}),
			o('TAG_START TagOptions TagAttributes TAG_END TagBody',function() {
				return A2.set({attributes: A3,body: A5,open: A1,close: A4});
			}),
			o('TAG_START { Expression } TAG_END',function() {
				return new TagWrapper(A3,A1,A5);
			})
		],
		
		TagTypeName: [
			o('Self',function() {
				return A1;
			}),
			o('IDENTIFIER',function() {
				return new TagTypeIdentifier(A1);
			}),
			o('',function() {
				return new TagTypeIdentifier('div');
			})
		],
		
		TagOptions: [
			o('TagTypeName',function() {
				return new Tag({type: A1});
			}),
			o('TagOptions . SYMBOL',function() {
				return A1.addSymbol(A3);
			}),
			// o 'IDENTIFIER' do Tag.new(type: TagTypeIdentifier.new(A1))
			o('TagOptions INDEX_START Expression INDEX_END',function() {
				return A1.addIndex(A3);
			}),
			o('TagOptions . IDENTIFIER',function() {
				return A1.addClass(A3);
			}),
			o('TagOptions . { Expression }',function() {
				return A1.addClass(A4);
			}), // WARN probably wont work
			o('TagOptions # IDENTIFIER',function() {
				return A1.set({id: A3});
			}),
			o('TagOptions Ivar',function() {
				return A1.set({ivar: A2});
			}),
			o('TagOptions # { Expression }',function() {
				return A1.set({id: A4});
			})
		],
		
		
		TagAttributes: [
			o('',function() {
				return [];
			}),
			o('TagAttr',function() {
				return [A1];
			}),
			o('TagAttributes , TagAttr',function() {
				return A1.concat(A3);
			}),
			o('TagAttributes OptComma TERMINATOR TagAttr',function() {
				return A1.concat(A4);
			})
		],
		
		TagAttr: [
			o('TAG_ATTR',function() {
				return new TagAttr(A1,A1);
			}),
			o('TAG_ATTR = TagAttrValue',function() {
				return new TagAttr(A1,A3);
			})
		],
		
		TagAttrValue: [
			o('Expression')
		],
		
		TagBody: [
			o('INDENT ArgList OUTDENT',function() {
				return A2.indented(A1,A3);
			}),
			// o 'ArgList' do A1
			o('CALL_START ArgList CALL_END',function() {
				return A2;
			})
		],
		
		TagTypeDef: [
			o('Identifier',function() {
				return new TagDesc(A1);
			}),
			o('TagTypeDef . Identifier',function() {
				return A1.classes(A3);
			})
		],
		
		
		
		// Class definitions have optional bodies of prototype property assignments,
		// and optional references to the superclass.
		TagDeclaration: [
			o('TagDeclarationBlock',function() {
				return A1;
			}),
			o('EXTEND TagDeclarationBlock',function() {
				return A2.set({extension: true});
			}),
			o('LOCAL TagDeclarationBlock',function() {
				return A2.set({local: true});
			})
		],
		
		TagDeclarationBlock: [
			o('TAG TagType',function() {
				return new TagDeclaration(A2);
			}),
			o('TAG TagType Block',function() {
				return new TagDeclaration(A2,null,A3);
			}),
			o('TAG TagType COMPARE TagType',function() {
				return new TagDeclaration(A2,A4);
			}),
			o('TAG TagType COMPARE TagType Block',function() {
				return new TagDeclaration(A2,A4,A5);
			})
		],
		
		TagDeclKeywords: [
			o(''),
			o('EXTEND',function() {
				return ['extend'];
			})
		],
		
		// Going to move back to fewer custom tokens
		TagType: [
			o('TAG_TYPE',function() {
				return new TagTypeIdentifier(A1);
			}),
			o('TAG_ID',function() {
				return new TagTypeIdentifier(A1);
			})
		],
		
		
		TagId: [
			o('IDREF',function() {
				return new TagId(A1);
			}),
			o('# Identifier',function() {
				return new TagId(A2);
			})
		],
		
		
		
		// Assignment of a variable, property, or index to a value.
		Assign: [
			// o 'SimpleAssignable , Assign' do A3
			o('Assignable = Expression',function() {
				return new Assign("=",A1,A3);
			}),
			o('Assignable = INDENT Expression Outdent',function() {
				return new Assign("=",A1,A4.indented(A3,A5));
			})
		],
		
		// Assignment when it happens within an object literal. The difference from
		// the ordinary **Assign** is that these allow numbers and strings as keys.
		AssignObj: [
			o('ObjAssignable',function() {
				return new ObjAttr(A1);
			}),
			o('ObjAssignable : Expression',function() {
				return new ObjAttr(A1,A3,'object');
			}),
			o('ObjAssignable : INDENT Expression Outdent',function() {
				return new ObjAttr(A1,A4.indented(A3,A5),'object');
			}),
			o('Comment')
		],
		
		ObjAssignable: [
			o('Identifier'),
			o('Const'),
			o('AlphaNumeric'),
			o('Ivar'), // rly?
			o('Gvar'), // rly?
			o('( Expression )',function() {
				return A2;
			})
		],
		
		
		
		// A block comment.
		Comment: [
			o('HERECOMMENT',function() {
				return new Comment(A1,true);
			}),
			o('COMMENT',function() {
				return new Comment(A1,false);
			})
		],
		
		// The **Code** node is the function literal. It's defined by an indented block
		// of **Block** preceded by a function arrow, with an optional parameter
		// list.
		Code: [
			o('Method'),
			o('Do'),
			o('Begin')
		],
		
		Begin: [
			o('BEGIN Block',function() {
				return new Begin(A2);
			})
		],
		
		Do: [
			o('DO Block',function() {
				return new Lambda([],A2,null,null,{bound: true});
			}),
			o('DO BLOCK_PARAM_START ParamList BLOCK_PARAM_END Block',function() {
				return new Lambda(A3,A5,null,null,{bound: true});
			}),
			// remove this, no?
			o('{ BLOCK_PARAM_START ParamList BLOCK_PARAM_END Block }',function() {
				return new Lambda(A3,A5,null,null,{bound: true});
			})
		],
		
		Property: [
			o('PropType PropertyIdentifier Object',function() {
				return new PropertyDeclaration(A2,A3,A1);
			}),
			o('PropType PropertyIdentifier CALL_START Object CALL_END',function() {
				return new PropertyDeclaration(A2,A4,A1);
			}),
			o('PropType PropertyIdentifier',function() {
				return new PropertyDeclaration(A2,null,A1);
			})
		],
		
		PropType: [
			o('PROP'),
			o('ATTR')
		],
		
		PropertyIdentifier: [
			o('Identifier'),
			o('{ Expression }',function() {
				return A2;
			})
		],
		
		TupleAssign: [
			// what about LET?
			o('VAR Identifier , Expression',function() {
				return A1;
			})
		],
		
		// FIXME clean up method
		Method: [
			o('MethodDeclaration',function() {
				return A1;
			}),
			o('GLOBAL MethodDeclaration',function() {
				return A2.set({global: A1});
			}),
			o('EXPORT MethodDeclaration',function() {
				return A2.set({export: A1});
			})
		],
		
		MethodDeclaration: [
			o('DEF MethodScope MethodScopeType MethodIdentifier CALL_START ParamList CALL_END DEF_BODY MethodBody',function() {
				return new MethodDeclaration(A6,A9,A4,A2,A3);
			}),
			
			o('DEF MethodScope MethodScopeType MethodIdentifier DEF_BODY MethodBody',function() {
				return new MethodDeclaration([],A6,A4,A2,A3);
			}),
			
			o('DEF MethodIdentifier CALL_START ParamList CALL_END DEF_BODY MethodBody',function() {
				return new MethodDeclaration(A4,A7,A2,null);
			}),
			
			o('DEF MethodIdentifier DEF_BODY MethodBody',function() {
				return new MethodDeclaration([],A4,A2,null);
			}),
			
			// haaaacks
			o('DEF MethodScope MethodScopeType MethodIdentifier CALL_START ParamList CALL_END DEF_FRAGMENT MethodBody',function() {
				return new MethodDeclaration(A6,A9,A4,A2,A3).set({greedy: true});
			}),
			
			o('DEF MethodScope MethodScopeType MethodIdentifier DEF_FRAGMENT MethodBody',function() {
				return new MethodDeclaration([],A6,A4,A2,A3).set({greedy: true});
			}),
			
			o('DEF MethodIdentifier CALL_START ParamList CALL_END DEF_FRAGMENT MethodBody',function() {
				return new MethodDeclaration(A4,A7,A2,null).set({greedy: true});
			}),
			
			o('DEF MethodIdentifier DEF_FRAGMENT MethodBody',function() {
				return new MethodDeclaration([],A4,A2,null).set({greedy: true});
			})
		],
		
		MethodScopeType: [
			o('.',function() {
				return {static: true};
			}),
			o('#',function() {
				return {};
			})
		],
		
		MethodIdentifier: [
			o('Identifier'),
			o('Const'),
			o('{ Expression }',function() {
				return A2;
			})
		],
		
		MethodReceiver: [],
		
		MethodBody: [
			o('Block'),
			o('Do',function() {
				return A1.body();
			})
		],
		
		// should support much more
		MethodScope: [
			o('MethodIdentifier'),
			o('This'),
			o('Self'), // global?
			o('Gvar')
		],
		
		// An optional, trailing comma.
		OptComma: [
			o(''),
			o(',')
		],
		
		// The list of parameters that a function accepts can be of any length.
		ParamList: [
			o('',function() {
				return [];
			}),
			o('Param',function() {
				return [A1];
			}),
			o('ParamList , Param',function() {
				return A1.concat(A3);
			})
		],
		
		// A single parameter in a function definition can be ordinary, or a splat
		// that hoovers up the remaining arguments.
		Param: [
			o('Object',function() {
				return new NamedParams(A1);
			}),
			o('Array',function() {
				return new ArrayParams(A1);
			}),
			o('ParamVar',function() {
				return new RequiredParam(A1);
			}),
			o('SPLAT ParamVar',function() {
				return new SplatParam(A2,null,A1);
			}),
			o('LOGIC ParamVar',function() {
				return new BlockParam(A2,null,A1);
			}),
			o('BLOCK_ARG ParamVar',function() {
				return new BlockParam(A2,null,A1);
			}),
			o('ParamVar = Expression',function() {
				return new OptionalParam(A1,A3,A2);
			})
		],
		ParamVar: [
			o('Identifier')
		],
		
		// A splat that occurs outside of a parameter list.
		Splat: [
			// o '... Expression' do Splat.new A2
			o('SPLAT Expression',function() {
				return AST.SPLAT(A2);
			})
		],
		
		// Reference: [
		// 	o 'Value Symbol' do Reference.new A1, A2
		// 	# o 'Value INDEX_START IndexValue INDEX_END' do Reference.new A1, A3.index
		// ]
		
		VarReference: [
			o('VAR SPLAT VarAssignable',function() {
				return AST.SPLAT(new VarReference(A3,A1),A2);
			}), // LocalIdentifier.new(A1)
			o('VAR VarAssignable',function() {
				return new VarReference(A2,A1);
			}), // LocalIdentifier.new(A1)
			o('LET VarAssignable',function() {
				return new VarReference(A2,A1);
			}), // LocalIdentifier.new(A1)
			o('LET SPLAT VarAssignable',function() {
				return AST.SPLAT(new VarReference(A3,A1),A2);
			}), // LocalIdentifier.new(A1)
			o('EXPORT VarReference',function() {
				return A2.set({export: A1});
			})
		],
		
		VarIdentifier: [
			o('Const'),
			o('Identifier')
		],
		
		VarAssignable: [
			o('Const'),
			o('Identifier'),
			o('Array') // all kinds?
		],
		
		// Variables and properties that can be assigned to.
		SimpleAssignable: [
			
			o('Const'),
			o('Ivar',function() {
				return new IvarAccess('.',null,A1);
			}),
			o('Gvar'),
			o('Argvar'),
			o('Self'), // not sure if self should be assignable really
			o('VarReference'),
			o('Identifier',function() {
				return new VarOrAccess(A1);
			}), // LocalIdentifier.new(A1)
			o('Value . NEW',function() {
				return new New(A1);
			}),
			o('Value . Super',function() {
				return new SuperAccess('.',A1,A3);
			}),
			o('Value SoakableOp Identifier',function() {
				return new PropertyAccess(A2,A1,A3);
			}),
			o('Value ?: Identifier',function() {
				return new Access(A2,A1,A3);
			}),
			o('Value SoakableOp Ivar',function() {
				return new Access(A2,A1,A3);
			}),
			o('Value . Symbol',function() {
				return new Access('.',A1,new Identifier(A3.value()));
			}),
			o('Value SoakableOp Const',function() {
				return new Access(A2,A1,A3);
			}),
			o('Value INDEX_START IndexValue INDEX_END',function() {
				return new IndexAccess('.',A1,A3);
			})
		],
		
		SoakableOp: [
			'.',
			'?.'
		],
		
		Super: [
			o('SUPER',function() {
				return AST.SUPER;
			})
		],
		
		// Everything that can be assigned to.
		Assignable: [
			o('SimpleAssignable'),
			o('Array'), //  do A1
			o('Object') // not supported anymore
		],
		
		Await: [
			o('AWAIT Expression',function() {
				return new Await(A2);
			})
		],
		
		// The types of things that can be treated as values -- assigned to, invoked
		// as functions, indexed into, named as a class, etc.
		Value: [
			o('Assignable'),
			o('Super'),
			o('Literal'),
			o('Parenthetical'),
			o('Range'),
			o('ARGUMENTS',function() {
				return AST.ARGUMENTS;
			}),
			o('This'),
			o('TagId'),
			o('Selector'),
			o('Invocation')
		],
		
		IndexValue: [
			// Do we need to wrap this?
			o('Expression',function() {
				return new Index(A1);
			}),
			o('Slice',function() {
				return new Slice(A1);
			})
		],
		
		// In Imba, an object literal is simply a list of assignments.
		Object: [
			o('{ AssignList OptComma }',function() {
				return new Obj(A2,A1.generated);
			})
		],
		
		// Assignment of properties within an object literal can be separated by
		// comma, as in JavaScript, or simply by newline.
		AssignList: [
			o('',function() {
				return new AssignList([]);
			}),
			o('AssignObj',function() {
				return new AssignList([A1]);
			}),
			o('AssignList , AssignObj',function() {
				return A1.add(A3);
			}),
			o('AssignList OptComma Terminator AssignObj',function() {
				return A1.add(A3).add(A4);
			}), // A4.prebreak(A3)
			// this is strange
			o('AssignList OptComma INDENT AssignList OptComma Outdent',function() {
				return A1.concat(A4.indented(A3,A6));
			})
		],
		
		// Class definitions have optional bodies of prototype property assignments,
		// and optional references to the superclass.
		
		
		// might as well handle this in the lexer instead
		Class: [
			o('ClassStart',function() {
				return A1;
			}),
			o('EXTEND ClassStart',function() {
				return A2.set({extension: A1});
			}),
			o('LOCAL ClassStart',function() {
				return A2.set({local: A1});
			}),
			o('GLOBAL ClassStart',function() {
				return A2.set({global: A1});
			}),
			o('EXPORT ClassStart',function() {
				return A2.set({export: A1});
			}),
			o('EXPORT LOCAL ClassStart',function() {
				return A3.set({export: A1,local: A2});
			})
		],
		
		ClassStart: [
			o('CLASS SimpleAssignable',function() {
				return new ClassDeclaration(A2,null,[]);
			}), // empty blocks
			o('CLASS SimpleAssignable Block',function() {
				return new ClassDeclaration(A2,null,A3);
			}),
			o('CLASS SimpleAssignable COMPARE Expression',function() {
				return new ClassDeclaration(A2,A4,[]);
			}),
			o('CLASS SimpleAssignable COMPARE Expression Block',function() {
				return new ClassDeclaration(A2,A4,A5);
			})
		],
		
		Module: [
			o('MODULE SimpleAssignable',function() {
				return new Module(A2);
			}),
			o('MODULE SimpleAssignable Block',function() {
				return new Module(A2,null,A3);
			})
		],
		
		// Ordinary function invocation, or a chained series of calls.
		Invocation: [
			o('Value OptFuncExist Arguments',function() {
				return new Call(A1,A3,A2);
			}),
			o('Value Do',function() {
				return A1.addBlock(A2);
			})
		// o 'Invocation OptFuncExist Arguments' do Call.new A1, A3, A2
		// o 'Invocation Do' do A1.addBlock(A2)
		],
		
		// An optional existence check on a function.
		OptFuncExist: [
			o('',function() {
				return false;
			}),
			o('FUNC_EXIST',function() {
				return true;
			})
		],
		
		// The list of arguments to a function call.
		Arguments: [
			o('CALL_START CALL_END',function() {
				return new ArgList([]);
			}),
			o('CALL_START ArgList OptComma CALL_END',function() {
				return A2;
			})
		],
		
		// A reference to the *this* current object.
		This: [
			o('THIS',function() {
				return new This(A1);
			}) // Value.new Literal.new 'this'
		
		// Add a Self-node instead
		],
		
		Self: [
			o('SELF',function() {
				return new Self(A1);
			})
		],
		
		// The array literal.
		Array: [
			o('[ ]',function() {
				return new Arr(new ArgList([]));
			}),
			o('[ ArgList OptComma ]',function() {
				return new Arr(A2);
			})
		],
		
		// Inclusive and exclusive range dots.
		RangeDots: [
			o('..',function() {
				return '..';
			}),
			o('...',function() {
				return '...';
			})
		],
		
		Range: [
			o('[ Expression RangeDots Expression ]',function() {
				return AST.OP(A3,A2,A4);
			}) // Range.new A2, A4, A3
		],
		
		// Array slice literals.
		Slice: [
			o('Expression RangeDots Expression',function() {
				return new Range(A1,A3,A2);
			}),
			o('Expression RangeDots',function() {
				return new Range(A1,null,A2);
			}),
			o('RangeDots Expression',function() {
				return new Range(null,A2,A1);
			})
		],
		
		// The **ArgList** is both the list of objects passed into a function call,
		// as well as the contents of an array literal
		// (i.e. comma-separated expressions). Newlines work as well.
		ArgList: [
			o('Arg',function() {
				return new ArgList([A1]);
			}),
			o('ArgList , Arg',function() {
				return A1.add(A3);
			}),
			o('ArgList OptComma Terminator Arg',function() {
				return A1.add(A3).add(A4);
			}),
			o('INDENT ArgList OptComma Outdent',function() {
				return A2.indented(A1,A4);
			}),
			o('ArgList OptComma INDENT ArgList OptComma Outdent',function() {
				return A1.concat(A4);
			})
		],
		
		Outdent: [
			o('Terminator OUTDENT',function() {
				return A1;
			}), // we are going to change how this works
			o('OUTDENT',function() {
				return A1;
			})
		],
		
		// Valid arguments are Blocks or Splats.
		Arg: [
			o('Expression'),
			o('Splat'),
			o('LOGIC'),
			o('Comment')
		],
		
		// Just simple, comma-separated, required arguments (no fancy syntax). We need
		// this to be separate from the **ArgList** for use in **Switch** blocks, where
		// having the newlines wouldn't make sense.
		SimpleArgs: [
			o('Expression'),
			o('SimpleArgs , Expression',function() {
				return [].concat(A1,A3);
			})
		],
		
		// The variants of *try/catch/finally* exception handling blocks.
		Try: [
			o('TRY Block',function() {
				return new Try(A2);
			}),
			o('TRY Block Catch',function() {
				return new Try(A2,A3);
			}),
			o('TRY Block Finally',function() {
				return new Try(A2,null,A3);
			}),
			o('TRY Block Catch Finally',function() {
				return new Try(A2,A3,A4);
			})
		],
		
		Finally: [
			o('FINALLY Block',function() {
				return new Finally(A2);
			})
		],
		
		// A catch clause names its error and runs a block of code.
		Catch: [
			o('CATCH CATCH_VAR Block',function() {
				return new Catch(A3,A2);
			})
		// o 'CATCH CATCH_VAR Expression' do Catch.new(A3,A2)
		],
		
		// Throw an exception object.
		Throw: [
			o('THROW Expression',function() {
				return new Throw(A2);
			})
		],
		
		// Parenthetical expressions. Note that the **Parenthetical** is a **Value**,
		// not an **Expression**, so if you need to use an expression in a place
		// where only values are accepted, wrapping it in parentheses will always do
		// the trick.
		Parenthetical: [
			o('( Body )',function() {
				return new Parens(A2);
			}),
			o('( INDENT Body OUTDENT )',function() {
				return new Parens(A3);
			})
		],
		// The condition portion of a while loop.
		WhileSource: [
			o('WHILE Expression',function() {
				return new While(A2);
			}),
			o('WHILE Expression WHEN Expression',function() {
				return new While(A2,{guard: A4});
			}),
			o('UNTIL Expression',function() {
				return new While(A2,{invert: true});
			}),
			o('UNTIL Expression WHEN Expression',function() {
				return new While(A2,{invert: true,guard: A4});
			})
		],
		
		// The while loop can either be normal, with a block of expressions to execute,
		// or postfix, with a single expression. There is no do..while.
		While: [
			o('WhileSource Block',function() {
				return A1.addBody(A2);
			}),
			o('Statement  WhileSource',function() {
				return A2.addBody(Block.wrap([A1]));
			}),
			o('Expression WhileSource',function() {
				return A2.addBody(Block.wrap([A1]));
			}),
			o('Loop',function() {
				return A1;
			})
		],
		
		Loop: [
			o('LOOP Block',function() {
				return new While(new Literal('true')).addBody(A2);
			}),
			o('LOOP Expression',function() {
				return new While(new Literal('true')).addBody(Block.wrap([A2]));
			})
		],
		
		// Array, object, and range comprehensions, at the most generic level.
		// Comprehensions can either be normal, with a block of expressions to execute,
		// or postfix, with a single expression.
		For: [
			o('Statement  ForBody',function() {
				return A2.addBody([A1]);
			}),
			o('Expression ForBody',function() {
				return A2.addBody([A1]);
			}),
			o('ForBody    Block',function() {
				return A1.addBody(A2);
			})
		],
		
		ForBlock: [
			o('ForBody Block',function() {
				return A1.addBody(A2);
			})
		],
		
		ForBody: [
			o('FOR Range',function() {
				return {source: new ValueNode(A2)};
			}),
			o('ForStart ForSource',function() {
				return A2.configure({own: A1.own,name: A1[0],index: A1[1]});
			})
		],
		
		ForStart: [
			o('FOR ForVariables',function() {
				return A2;
			}),
			o('FOR OWN ForVariables',function() {
				return (A3.own = true) && A3;
			})
		],
		
		// An array of all accepted values for a variable inside the loop.
		// This enables support for pattern matching.
		ForValue: [
			o('Identifier'),
			o('Array',function() {
				return new ValueNode(A1);
			}),
			o('Object',function() {
				return new ValueNode(A1);
			})
		],
		
		// An array or range comprehension has variables for the current element
		// and (optional) reference to the current index. Or, *key, value*, in the case
		// of object comprehensions.
		ForVariables: [
			o('ForValue',function() {
				return [A1];
			}),
			o('ForValue , ForValue',function() {
				return [A1,A3];
			})
		],
		
		// The source of a comprehension is an array or object with an optional guard
		// clause. If it's an array comprehension, you can also choose to step through
		// in fixed-size increments.
		ForSource: [
			o('FORIN Expression',function() {
				return new ForIn({source: A2});
			}),
			o('FOROF Expression',function() {
				return new ForOf({source: A2,object: true});
			}),
			o('FORIN Expression WHEN Expression',function() {
				return new ForIn({source: A2,guard: A4});
			}),
			o('FOROF Expression WHEN Expression',function() {
				return new ForOf({source: A2,guard: A4,object: true});
			}),
			o('FORIN Expression BY Expression',function() {
				return new ForIn({source: A2,step: A4});
			}),
			o('FORIN Expression WHEN Expression BY Expression',function() {
				return new ForIn({source: A2,guard: A4,step: A6});
			}),
			o('FORIN Expression BY Expression WHEN Expression',function() {
				return new ForIn({source: A2,step: A4,guard: A6});
			})
		],
		
		Switch: [
			o('SWITCH Expression INDENT Whens OUTDENT',function() {
				return new Switch(A2,A4);
			}),
			o('SWITCH Expression INDENT Whens ELSE Block Outdent',function() {
				return new Switch(A2,A4,A6);
			}),
			o('SWITCH INDENT Whens OUTDENT',function() {
				return new Switch(null,A3);
			}),
			o('SWITCH INDENT Whens ELSE Block OUTDENT',function() {
				return new Switch(null,A3,A5);
			})
		],
		
		Whens: [
			o('When'),
			o('Whens When',function() {
				return A1.concat(A2);
			})
		],
		
		// An individual **When** clause, with action.
		When: [
			o('LEADING_WHEN SimpleArgs Block',function() {
				return [new SwitchCase(A2,A3)];
			}),
			o('LEADING_WHEN SimpleArgs Block TERMINATOR',function() {
				return [new SwitchCase(A2,A3)];
			})
		],
		
		// The most basic form of *if* is a condition and an action. The following
		// if-related rules are broken up along these lines in order to avoid
		// ambiguity.
		
		
		IfBlock: [
			o('IF Expression Block',function() {
				return new If(A2,A3,{type: A1});
			}),
			o('IfBlock ELSE IF Expression Block',function() {
				return A1.addElse(new If(A4,A5,{type: A3}));
			}),
			
			// seems like this refers to the wrong blocks no?
			o('IfBlock ELIF Expression Block',function() {
				return A1.addElse(new If(A3,A4,{type: A2}));
			}),
			
			o('IfBlock ELSE Block',function() {
				return A1.addElse(A3);
			})
		],
		
		// The full complement of *if* expressions, including postfix one-liner
		// *if* and *unless*.
		If: [
			o('IfBlock'),
			o('Statement  POST_IF Expression',function() {
				return new If(A3,new Block([A1]),{type: A2,statement: true});
			}),
			o('Expression POST_IF Expression',function() {
				return new If(A3,new Block([A1]),{type: A2});
			}) // , statement: true # why is this a statement?!?
		],
		
		Ternary: [
			o('Expression ? Expression : Expression',function() {
				return AST.If.ternary(A1,A3,A5);
			})
		],
		
		// Arithmetic and logical operators, working on one or more operands.
		// Here they are grouped by order of precedence. The actual precedence rules
		// are defined at the bottom of the page. It would be shorter if we could
		// combine most of these rules into a single generic *Operand OpSymbol Operand*
		// -type rule, but in order to make the precedence binding possible, separate
		// rules are necessary.
		Operation: [
			o('UNARY Expression',function() {
				return AST.OP(A1,A2);
			}),
			o('SQRT Expression',function() {
				return AST.OP(A1,A2);
			}),
			o('-     Expression',function() {
				return new Op('-',A2);
			},{prec: 'UNARY'}),
			o('+     Expression',function() {
				return new Op('+',A2);
			},{prec: 'UNARY'}),
			o('-- SimpleAssignable',function() {
				return new UnaryOp('--',null,A2);
			}),
			o('++ SimpleAssignable',function() {
				return new UnaryOp('++',null,A2);
			}),
			o('SimpleAssignable --',function() {
				return new UnaryOp('--',A1,null,true);
			}),
			o('SimpleAssignable ++',function() {
				return new UnaryOp('++',A1,null,true);
			}),
			
			// [The existential operator](http://jashkenas.github.com/coffee-script/#existence).
			o('Expression ?',function() {
				return new Existence(A1);
			}),
			
			o('Expression +  Expression',function() {
				return new Op('+',A1,A3);
			}),
			o('Expression -  Expression',function() {
				return new Op('-',A1,A3);
			}),
			
			o('Expression MATH     Expression',function() {
				return AST.OP(A2,A1,A3);
			}),
			o('Expression SHIFT    Expression',function() {
				return AST.OP(A2,A1,A3);
			}),
			o('Expression COMPARE  Expression',function() {
				return AST.OP(A2,A1,A3);
			}),
			o('Expression LOGIC    Expression',function() {
				return AST.OP(A2,A1,A3);
			}),
			// o 'Expression ?.    Expression' do AST.OP A2, A1, A3
			
			o('Expression RELATION Expression',function() {
				if (A2.charAt(0) == '!') {
					return AST.OP(A2.slice(1),A1,A3).invert();
				} else {
					return AST.OP(A2,A1,A3);
				};
			}),
			
			o('SimpleAssignable COMPOUND_ASSIGN Expression',function() {
				return AST.OP_COMPOUND(A2._value,A2,A1,A3);
			}),
			o('SimpleAssignable COMPOUND_ASSIGN INDENT Expression Outdent',function() {
				return AST.OP_COMPOUND(A2._value,A1,A4.indented(A3,A5));
			})
		]
	};
	
	
	// Precedence
	// ----------
	
	var operators = [
		['left','MSET'],
		['left','.','?.','?:','::'],
		['left','CALL_START','CALL_END'],
		['nonassoc','++','--'],
		['right','UNARY','THROW','SQRT'],
		['left','MATH'],
		['left','+','-'],
		['left','SHIFT'],
		['left','RELATION'],
		['left','COMPARE'],
		['left','LOGIC'],
		['left','?'],
		['left','AWAIT'], // not really sure?
		['nonassoc','INDENT','OUTDENT'],
		['right','=',':','COMPOUND_ASSIGN','RETURN','THROW','EXTENDS'],
		['right','FORIN','FOROF','BY','WHEN'],
		['right','TAG_END'],
		['right','IF','ELSE','FOR','DO','WHILE','UNTIL','LOOP','SUPER','CLASS','MODULE','TAG','EVENT','TRIGGER','TAG_END'],
		['right','POST_IF'],
		['right','NEW_TAG'],
		['right','TAG_ATTR_SET'],
		['right','SPLAT'],
		['left','SELECTOR_START']
	];
	
	// Wrapping Up
	// -----------
	
	// Finally, now that we have our **grammar** and our **operators**, we can create
	// our **Jison.Parser**. We do this by processing all of our rules, recording all
	// terminals (every symbol which does not appear as the name of a rule above)
	// as "tokens".
	
	var tokens = [];
	;
	for (var name in grammar){
		for (var i=0, ary=iter$(grammar[name]), len=ary.length, alt, res=[]; i < len; i++) {
			alt = ary[i];for (var j=0, items=iter$(alt[0].split(' ')), len_=items.length, token; j < len_; j++) {
				token = items[j];if (!(grammar[token])) { tokens.push(token) };
			};
			if (name == 'Root') { alt[1] = ("return " + (alt[1])) };
			res.push(alt);
		};
		grammar[name] = res;
	};
	
	// Initialize the **Parser** with our list of terminal **tokens**, our **grammar**
	// rules, and the name of the root. Reverse the operators because Jison orders
	// precedence from low to high, and we have it high to low
	// (as in [Yacc](http://dinosaur.compilertools.net/yacc/index.html)).
	
	exports.parser = new Parser(
		{tokens: tokens.join(' '),
		bnf: grammar,
		operators: operators.reverse(),
		startSymbol: 'Root'}
	);


}())